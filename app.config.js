module.exports = ({ config }) => {
  return {
    ...config,
    android: {
      ...config.android,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
    },
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        NSCalendarsUsageDescription: "This app needs access to your calendar to add division meeting events.",
        NSRemindersUsageDescription: "This app needs access to your reminders to add meeting notifications.",
      },
    },
  };
};
