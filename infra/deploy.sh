#!/usr/bin/env bash
# Deploys the Verdict backend to AWS. Safe to re-run: creates what's missing, updates the rest.
#
#   S3 bucket      verdict-shares-<acct>-<region> shared screenshots (private, auto-deleted after 30 days)
#   IAM role       verdict-lambda                 logs + that bucket + Textract + invoking the worker
#   Lambda         verdict-api                    Fastify HTTP API behind a public Function URL
#   Lambda         verdict-worker                 background processing, invoked async by the API
#
# Postgres is RDS `verdict-db` in the same region (created once by hand).
# Supabase (sign-in only) and Expo Push are external. Settings come from server/.env.
set -euo pipefail

REGION="${AWS_REGION:-ap-south-1}" # Mumbai, same region as the RDS Postgres: queries are ~1 ms, not a cross-region hop
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="verdict-shares-${ACCOUNT}-${REGION}"
ROLE="verdict-lambda"
API_FN="verdict-api"
WORKER_FN="verdict-worker"
cd "$(dirname "$0")/../server"

echo "▸ S3 bucket ${BUCKET}"
if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
fi
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration \
  '{"Rules":[{"ID":"expire-shares","Status":"Enabled","Filter":{"Prefix":"shares/"},"Expiration":{"Days":30}}]}'

echo "▸ IAM role ${ROLE}"
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document \
    '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  sleep 10 # new roles take a moment before Lambda can assume them
fi
aws iam put-role-policy --role-name "$ROLE" --policy-name verdict-app --policy-document "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {\"Effect\": \"Allow\", \"Action\": [\"s3:GetObject\", \"s3:PutObject\"], \"Resource\": \"arn:aws:s3:::${BUCKET}/*\"},
    {\"Effect\": \"Allow\", \"Action\": \"textract:DetectDocumentText\", \"Resource\": \"*\"},
    {\"Effect\": \"Allow\", \"Action\": \"lambda:InvokeFunction\", \"Resource\": \"arn:aws:lambda:${REGION}:${ACCOUNT}:function:${WORKER_FN}\"}
  ]
}"
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE}"

echo "▸ Bundling"
npm run --silent build:lambda
for fn in api worker; do
  python -c "import shutil,sys; shutil.make_archive(sys.argv[1], 'zip', sys.argv[2])" "dist-lambda/$fn" "dist-lambda/$fn"
done

# Runtime settings: the keys the server reads, taken from server/.env.
ENV_JSON="$(node -e '
  require("dotenv").config({ quiet: true });
  const keys = ["DATABASE_URL","FIRECRAWL_API_KEY","BEDROCK_REGION","BEDROCK_MANTLE_API_KEY","BEDROCK_MODEL_MAP","AI_POLICY",
    "ANTHROPIC_API_KEY","SUPABASE_URL","SUPABASE_JWT_ISSUER","SUPABASE_JWT_SECRET","POSTHOG_API_KEY","POSTHOG_HOST"];
  const vars = { NODE_ENV: "production", CORS_ORIGINS: "https://verdict.invalid",
    SHARES_BUCKET: process.argv[1], WORKER_FUNCTION_NAME: process.argv[2] };
  for (const k of keys) if (process.env[k]?.trim()) vars[k] = process.env[k].trim();
  // In Lambda the RDS certificate is checked against the CA bundle the runtime ships.
  vars.DATABASE_URL = vars.DATABASE_URL?.replace("sslmode=require", "sslmode=verify-full");
  vars.NODE_EXTRA_CA_CERTS = "/var/runtime/ca-cert.pem";
  process.stdout.write(JSON.stringify({ Variables: vars }));
' "$BUCKET" "$WORKER_FN")"

deploy_fn() { # name zip timeout memory
  if aws lambda get-function --function-name "$1" >/dev/null 2>&1; then
    aws lambda update-function-code --function-name "$1" --zip-file "fileb://$2" >/dev/null
    aws lambda wait function-updated --function-name "$1"
    aws lambda update-function-configuration --function-name "$1" --timeout "$3" --memory-size "$4" \
      --environment "$ENV_JSON" >/dev/null
  else
    aws lambda create-function --function-name "$1" --runtime nodejs22.x --architectures arm64 \
      --handler index.handler --role "$ROLE_ARN" --zip-file "fileb://$2" \
      --timeout "$3" --memory-size "$4" --environment "$ENV_JSON" >/dev/null
  fi
  aws lambda wait function-updated --function-name "$1"
}

echo "▸ Lambda ${WORKER_FN}"
deploy_fn "$WORKER_FN" dist-lambda/worker.zip 600 1024
# Async invokes: Lambda keeps the event up to 1h and retries a failure twice.
aws lambda put-function-event-invoke-config --function-name "$WORKER_FN" \
  --maximum-retry-attempts 2 --maximum-event-age-in-seconds 3600 >/dev/null

echo "▸ Lambda ${API_FN}"
deploy_fn "$API_FN" dist-lambda/api.zip 30 1024
if ! aws lambda get-function-url-config --function-name "$API_FN" >/dev/null 2>&1; then
  aws lambda create-function-url-config --function-name "$API_FN" --auth-type NONE >/dev/null
  aws lambda add-permission --function-name "$API_FN" --statement-id public-url \
    --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE >/dev/null
  # Newer accounts also require InvokeFunction, scoped to calls that come through the URL.
  aws lambda add-permission --function-name "$API_FN" --statement-id public-url-invoke     --action lambda:InvokeFunction --principal "*" --invoked-via-function-url >/dev/null
fi

URL="$(aws lambda get-function-url-config --function-name "$API_FN" --query FunctionUrl --output text)"
echo "✓ API: ${URL}   (set EXPO_PUBLIC_API_URL to this, without the trailing slash)"
