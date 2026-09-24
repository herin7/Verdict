/** Dev builds prefill the sign-in form with a demo account from EXPO_PUBLIC_DEMO_EMAIL / EXPO_PUBLIC_DEMO_PASSWORD. */
const email = process.env.EXPO_PUBLIC_DEMO_EMAIL;
const password = process.env.EXPO_PUBLIC_DEMO_PASSWORD;
export const demoCredentials = __DEV__ && email && password ? { email, password } : null;
