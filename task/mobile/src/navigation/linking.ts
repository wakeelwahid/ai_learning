import * as Linking from "expo-linking";
import type { LinkingOptions } from "@react-navigation/native";

// Deep-link route table. `app.json`'s `scheme: "eduai"` already registers
// the custom URL scheme with the native shell — this file is the missing
// JS-side half that maps a URL's path onto a real screen + params. Every
// path here targets a screen that's a genuine Stack.Screen/Tab.Screen in
// MainNavigator.tsx (never a Modal-hosted one — those can't be resolved by
// path since they don't exist as navigator routes).
//
// `Linking.createURL("/")` covers Expo Go / dev-client (exp://...); the
// custom scheme covers a standalone build; the https prefix is a
// placeholder for a future universal-link/App-Links domain association
// (assetlinks.json / apple-app-site-association hosting is a separate,
// backend/hosting task — not blocking, since the scheme + createURL
// prefixes already make every screen below deep-linkable today).
export const linking: LinkingOptions<any> = {
  prefixes: [Linking.createURL("/"), "eduai://", "https://eduai.app"],
  config: {
    screens: {
      Tabs: {
        screens: {
          Dashboard: "home",
          Learn: "learn",
          AI: "ai",
          Chat: "chat",
          Profile: "profile",
          // Parent tab names collide with student tab route params under
          // one Tab.Navigator config — Home/Monitor/Messages map the
          // parent-role tab bar; the same `Tabs` stack entry serves both
          // role variants at runtime (see StudentTabsNavigator/
          // ParentTabsNavigator), so listing both sets of tab names here is
          // safe — only the ones matching the currently-mounted tab bar ever
          // resolve.
          Home: "parent/home",
          Monitor: "parent/monitor",
          "AI Chat": "parent/ai-chat",
          Messages: "parent/messages",
        },
      },
      Messages: "messages",
      Leaderboard: "leaderboard",
      CareerHub: "careers",
      Notifications: "notifications",
      NotificationPreferences: "notification-preferences",
      ParentNotificationPrefs: "parent/notification-preferences",
      ParentMeetings: "parent/meetings",
      ParentCommunication: "parent/communication",
      // Real Stack.Screens (not Modals), take route params — a plain path
      // segment can only carry the id, matching the pattern used for Quiz/
      // VideoPlayer/ChallengeDetail below.
      ParentRoomView: "parent/rooms/:roomId",
      GroupSettings: "chat/rooms/:roomId/settings",
      Search: "search",
      EduPointsShop: "edupoints-shop",
      WeeklyReport: "weekly-report",
      Saved: "saved",
      KnowledgeHub: "knowledge-hub",
      LevelProgress: "level-progress",
      Feedback: "feedback",
      LinkStudent: "link-student",
      StudyLimits: "study-limits",
      StudentParentChat: "chat/parent",
      BattleReview: "battle-review/:battleId",
      Subscription: "subscription",
      Challenges: "challenges",
      ChallengeDetail: "challenges/:programId",
      Referral: "refer",
      Quiz: "quiz/:quizId",
      Battle: "battle",
      Analytics: "analytics",
      Career: "career",
      Roadmap: "roadmap",
      Revision: "revision",
      PreviousYearPapers: "previous-year-papers",
      AITutor: "ai-tutor",
      VideoPlayer: "video/:videoId",
    },
  },
};
