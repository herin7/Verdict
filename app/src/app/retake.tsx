import { useRouter } from "expo-router";
import { useSession } from "@/features/auth/session";
import { BuyerQuiz } from "@/features/profile/BuyerQuiz";

/** Retake the buyer profile, starting from the current answers. */
export default function Retake() {
  const router = useRouter();
  const { profile, saveProfile } = useSession();
  return (
    <BuyerQuiz
      initial={profile}
      doneLabel="Save"
      onClose={() => router.back()}
      onDone={async (next) => {
        await saveProfile(next);
        router.back();
      }}
    />
  );
}
