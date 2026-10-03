import { useSession } from "@/features/auth/session";
import { BuyerQuiz } from "@/features/profile/BuyerQuiz";

/** First run: the buyer profile every verdict is weighed against. Sign-in comes after. */
export default function Onboarding() {
  const { completeOnboarding } = useSession();
  return <BuyerQuiz onDone={completeOnboarding} doneLabel="Start using Verdict" />;
}
