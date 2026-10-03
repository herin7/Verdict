import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { FadeInLeft, FadeInRight, FadeOut, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../../components/icons";
import { Button, IconButton, Text } from "../../components/ui";
import { colors, fonts, motion, radius, space } from "../../theme";
import { BuyerDna } from "./BuyerDna";
import { OptionList, StepSlider } from "./controls";
import { QUESTIONS, type BuyerProfile, type Question } from "./questions";

type Answers = Partial<BuyerProfile>;

const MAX_PICKS = 3;
/** Long enough to see the selection land before the next question slides in. */
const AUTO_ADVANCE_MS = 280;
/** Sliders start in the middle, so they're answered the moment they appear. */
const SLIDER_DEFAULTS: Answers = { spendStyle: "balanced", novelty: "open" };

/**
 * Welcome → eight questions, one per screen → buyer DNA.
 * Single answers advance on tap; pick-up-to-3 and sliders wait for Continue.
 */
export function BuyerQuiz({
  initial,
  onDone,
  doneLabel,
  onClose,
}: {
  /** Retake: start from their current answers and skip the welcome. */
  initial?: BuyerProfile | null;
  onDone: (profile: BuyerProfile) => Promise<void> | void;
  doneLabel: string;
  onClose?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [answers, setAnswers] = useState<Answers>(initial ?? SLIDER_DEFAULTS);
  // -1 welcome, 0..7 questions, 8 buyer DNA
  const [step, setStep] = useState(initial ? 0 : -1);
  const [forward, setForward] = useState(true);
  const [saving, setSaving] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  const total = QUESTIONS.length;
  const question = step >= 0 && step < total ? QUESTIONS[step] : null;
  const profile = step === total ? complete(answers) : null;

  function go(next: number) {
    clearTimeout(advanceTimer.current);
    setForward(next > step);
    setStep(next);
    if (next === total) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (next > step) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function set(patch: Answers) {
    setAnswers((a) => ({ ...a, ...patch }));
  }

  async function finish() {
    if (!profile) return;
    setSaving(true);
    try {
      await onDone({ ...profile, calibration: initial?.calibration ?? {} });
    } finally {
      setSaving(false);
    }
  }

  const back = step > (initial ? 0 : -1) ? () => go(step - 1) : onClose;
  const entering = (forward ? FadeInRight : FadeInLeft).springify().damping(20).stiffness(180);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space(2), paddingBottom: insets.bottom + space(4) }]}>
      <View style={styles.top}>
        <View style={styles.back}>
          {back ? <IconButton icon={step === 0 && onClose ? Icon.XCircle : Icon.CaretLeft} label="Back" onPress={back} /> : null}
        </View>
        {question ? <Progress step={step} total={total} /> : <View style={styles.flex} />}
        <View style={styles.back} />
      </View>

      <Animated.View key={step} entering={entering} exiting={FadeOut.duration(motion.fast)} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} bounces={false}>
          {step === -1 ? <Welcome /> : null}
          {question ? (
            <>
              <View style={styles.heading}>
                <Text style={styles.title} accessibilityRole="header">
                  {question.title}
                </Text>
                {"hint" in question ? <Text variant="subhead">{question.hint}</Text> : null}
              </View>
              <Answer
                question={question}
                answers={answers}
                onChange={set}
                onAutoAdvance={() => {
                  advanceTimer.current = setTimeout(() => go(step + 1), AUTO_ADVANCE_MS);
                }}
              />
            </>
          ) : null}
          {profile ? (
            <>
              <Text variant="overline" style={styles.dnaLabel}>
                Your buyer DNA
              </Text>
              <BuyerDna profile={profile} />
            </>
          ) : null}
        </ScrollView>
      </Animated.View>

      <View style={styles.footer}>
        {step === -1 ? <Button label="Begin" size="lg" onPress={() => go(0)} /> : null}
        {question && question.kind !== "single" ? (
          <Button label="Continue" size="lg" disabled={!answered(question, answers)} onPress={() => go(step + 1)} />
        ) : null}
        {profile ? <Button label={doneLabel} size="lg" icon={Icon.ArrowRight} loading={saving} onPress={finish} /> : null}
        {step === -1 ? (
          <Text variant="caption" style={styles.center}>
            8 quick questions · about a minute
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Welcome() {
  return (
    <View style={styles.welcome}>
      <View style={styles.mark}>
        <Icon.Fingerprint size={36} color={colors.primary} weight="duotone" />
      </View>
      <Text style={styles.hero}>Verdicts, tuned to you.</Text>
      <Text variant="body" style={styles.lede}>
        A product that’s perfect for someone else can be wrong for you. Tell us how you buy, and every verdict is weighed against
        what you care about.
      </Text>
    </View>
  );
}

function Answer({
  question,
  answers,
  onChange,
  onAutoAdvance,
}: {
  question: Question;
  answers: Answers;
  onChange: (patch: Answers) => void;
  onAutoAdvance: () => void;
}) {
  const field = question.field;
  const value = answers[field];

  if (question.kind === "slider") {
    return <StepSlider options={question.options} value={value as string} ends={"ends" in question ? question.ends : undefined} onChange={(k) => onChange({ [field]: k })} />;
  }

  if (question.kind === "single") {
    return (
      <OptionList
        options={question.options}
        isSelected={(k) => value === k}
        onPick={(k) => {
          void Haptics.selectionAsync();
          onChange({ [field]: k });
          onAutoAdvance();
        }}
      />
    );
  }

  // multi (up to 3) and rank (top 3, in tap order)
  const picked = (value as string[] | undefined) ?? [];
  return (
    <OptionList
      options={question.options}
      isSelected={(k) => picked.includes(k)}
      badge={question.kind === "rank" ? (k) => String(picked.indexOf(k) + 1) : () => "✓"}
      onPick={(k) => {
        if (picked.includes(k)) {
          void Haptics.selectionAsync();
          onChange({ [field]: picked.filter((p) => p !== k) });
        } else if (picked.length < MAX_PICKS) {
          void Haptics.selectionAsync();
          onChange({ [field]: [...picked, k] });
        } else {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      }}
    />
  );
}

function Progress({ step, total }: { step: number; total: number }) {
  return (
    <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel={`Question ${step + 1} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <Segment key={i} on={i <= step} />
      ))}
    </View>
  );
}

function Segment({ on }: { on: boolean }) {
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: withSpring(on ? 1 : 0, motion.spring) }] }));
  return (
    <View style={styles.segment}>
      <Animated.View style={[styles.segmentFill, fill]} />
    </View>
  );
}

function answered(q: Question, a: Answers): boolean {
  const v = a[q.field];
  return Array.isArray(v) ? v.length > 0 : Boolean(v);
}

/** Every question answered → a full profile; otherwise null. */
function complete(a: Answers): BuyerProfile | null {
  if (!QUESTIONS.every((q) => answered(q, a))) return null;
  return { version: 1, calibration: {}, ...a } as BuyerProfile;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: "center" },
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: "row", alignItems: "center", gap: space(3), paddingHorizontal: space(4), minHeight: 48 },
  back: { width: 40 },
  progress: { flex: 1, flexDirection: "row", gap: space(1) },
  segment: { flex: 1, height: 4, borderRadius: radius.full, backgroundColor: colors.border, overflow: "hidden" },
  segmentFill: { flex: 1, backgroundColor: colors.primary, transformOrigin: "left" },
  body: { flexGrow: 1, paddingHorizontal: space(6), paddingTop: space(10), paddingBottom: space(6), gap: space(8) },
  heading: { gap: space(3) },
  title: { fontFamily: fonts.extrabold, fontSize: 32, lineHeight: 38, letterSpacing: -0.8, color: colors.text },
  welcome: { flex: 1, justifyContent: "center", gap: space(6) },
  mark: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  hero: { fontFamily: fonts.extrabold, fontSize: 40, lineHeight: 46, letterSpacing: -1.2, color: colors.text },
  lede: { color: colors.textMuted, fontSize: 17, lineHeight: 26 },
  dnaLabel: { marginBottom: -space(4) },
  footer: { paddingHorizontal: space(6), gap: space(3) },
});
