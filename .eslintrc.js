// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: "expo",
  ignorePatterns: ["/dist/*"],
  rules: {
    // Disallow direct use of supabase.channel to enforce wrapper usage
    "no-restricted-syntax": [
      "error",
      {
        selector: "CallExpression[callee.object.name='supabase'][callee.property.name='channel']",
        message: "Use createRealtimeChannel wrapper from utils/realtime instead of supabase.channel directly.",
      },
    ],
  },
};
