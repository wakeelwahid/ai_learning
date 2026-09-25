import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "@/theme/colors";
import { messageApi } from "@/api/message";
import DashboardScreen              from "@/screens/main/DashboardScreen";
import LearnScreen                  from "@/screens/main/LearnScreen";
import LeaderboardScreen            from "@/screens/main/LeaderboardScreen";
import ProfileScreen                from "@/screens/main/ProfileScreen";
import CareerHubScreen              from "@/screens/main/CareerHubScreen";
import MessagesScreen               from "@/screens/chat/MessagesScreen";
import StudentMessagesScreen        from "@/screens/main/StudentMessagesScreen";
import AITutorScreen                from "@/screens/main/AITutorScreen";
import ParentDashboardScreen        from "@/screens/parent/ParentDashboardScreen";
import TeacherDashboardScreen       from "@/screens/teacher/TeacherDashboardScreen";
import ParentMonitorScreen          from "@/screens/parent/ParentMonitorScreen";
import ParentAIChatScreen           from "@/screens/parent/ParentAIChatScreen";
import ParentMessagesScreen         from "@/screens/parent/ParentMessagesScreen";
import ParentRoomViewScreen         from "@/screens/parent/ParentRoomViewScreen";
import GroupSettingsScreen          from "@/screens/chat/GroupSettingsScreen";
import NotificationsScreen          from "@/screens/main/NotificationsScreen";
import NotificationPreferencesScreen from "@/screens/main/NotificationPreferencesScreen";
import SearchScreen                 from "@/screens/main/SearchScreen";
import EduPointsShopScreen          from "@/screens/main/EduPointsShopScreen";
import WeeklyReportScreen           from "@/screens/main/WeeklyReportScreen";
import SavedScreen                  from "@/screens/main/SavedScreen";
import KnowledgeHubScreen           from "@/screens/main/KnowledgeHubScreen";
import LevelProgressScreen          from "@/screens/main/LevelProgressScreen";
import FeedbackScreen               from "@/screens/main/FeedbackScreen";
import LinkStudentScreen            from "@/screens/parent/LinkStudentScreen";
import StudyLimitsScreen            from "@/screens/parent/StudyLimitsScreen";
import ParentSettingsScreen         from "@/screens/parent/ParentSettingsScreen";
import ParentNotificationPrefsScreen from "@/screens/parent/ParentNotificationPrefsScreen";
import BattleReviewScreen           from "@/screens/main/BattleReviewScreen";
import SubscriptionScreen           from "@/screens/main/SubscriptionScreen";
import ParentMeetingsScreen         from "@/screens/parent/ParentMeetingsScreen";
import ParentCommunicationScreen    from "@/screens/parent/ParentCommunicationScreen";
import ChallengesScreen             from "@/screens/main/ChallengesScreen";
import ChallengeDetailScreen        from "@/screens/main/ChallengeDetailScreen";
import QuizScreen                   from "@/screens/main/QuizScreen";
import BattleScreen                 from "@/screens/main/BattleScreen";
import AnalyticsScreen              from "@/screens/main/AnalyticsScreen";
import CareerScreen                 from "@/screens/main/CareerScreen";
import RoadmapScreen                from "@/screens/main/RoadmapScreen";
import RevisionScreen               from "@/screens/main/RevisionScreen";
import PreviousYearPapersScreen     from "@/screens/main/PreviousYearPapersScreen";
import VideoPlayerScreen            from "@/screens/main/VideoPlayerScreen";
import ReferralScreen               from "@/screens/main/ReferralScreen";
import { useLanguage }              from "@/contexts/LanguageContext";
import { useAppSelector }           from "@/store";
import { usePushNotifications }     from "@/hooks/usePushNotifications";
import { useLinkBadges }            from "@/hooks/useLinkBadges";

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

interface TabConfig {
  name: string;
  component: React.ComponentType<any>;
  iconFilled: string;
  iconOutline: string;
  labelKey: string;
  badge?: "student_profile" | "parent_home" | "messages_unread";
}

// ── Student tabs ──────────────────────────────────────────────────────────────
const STUDENT_TABS: TabConfig[] = [
  { name: "Dashboard",  component: DashboardScreen,  iconFilled: "home",        iconOutline: "home-outline",        labelKey: "home"      },
  { name: "Learn",      component: LearnScreen,       iconFilled: "book",        iconOutline: "book-outline",        labelKey: "learn"     },
  { name: "AI",         component: AITutorScreen,     iconFilled: "sparkles",    iconOutline: "sparkles-outline",    labelKey: "ai"        },
  { name: "Chat",       component: MessagesScreen,    iconFilled: "chatbubble-ellipses", iconOutline: "chatbubble-ellipses-outline", labelKey: "chat", badge: "messages_unread" },
  { name: "Profile",    component: ProfileScreen,     iconFilled: "person",      iconOutline: "person-outline",      labelKey: "profile", badge: "student_profile" },
];

// ── Parent tabs ───────────────────────────────────────────────────────────────
const PARENT_TABS: TabConfig[] = [
  { name: "Home",       component: ParentDashboardScreen, iconFilled: "home",      iconOutline: "home-outline",      labelKey: "home", badge: "parent_home" },
  { name: "Monitor",    component: ParentMonitorScreen,   iconFilled: "eye",       iconOutline: "eye-outline",       labelKey: "monitor"   },
  { name: "AI Chat",    component: ParentAIChatScreen,    iconFilled: "chatbubble",iconOutline: "chatbubble-outline",labelKey: "ai_chat"   },
  { name: "Messages",   component: ParentMessagesScreen,  iconFilled: "mail",      iconOutline: "mail-outline",      labelKey: "messages", badge: "messages_unread" },
  { name: "Profile",    component: ParentSettingsScreen,  iconFilled: "person",    iconOutline: "person-outline",    labelKey: "profile"   },
];

// ── Teacher tabs ──────────────────────────────────────────────────────────────
// Teachers have exactly one real screen right now (cohort analytics) — no
// roster, messaging, or profile screens exist for this role yet. A
// single-tab navigator (rather than a bare screen) keeps this role on the
// same TabsNavigator machinery as student/parent, so it gets the same
// header-less full-screen shell and stays trivially extensible later.
const TEACHER_TABS: TabConfig[] = [
  { name: "Cohort", component: TeacherDashboardScreen, iconFilled: "bar-chart", iconOutline: "bar-chart-outline", labelKey: "home" },
];

function TabsNavigator({ tabs }: { tabs: TabConfig[] }) {
  const { t } = useLanguage();
  const { pendingIncoming, pendingOutgoing, pendingApprovals } = useLinkBadges();
  const userId = useAppSelector((s) => s.auth.user?.id ?? "");

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["messages-unread", userId],
    queryFn: () => messageApi.unreadCount(userId).then((r) => r.data?.count ?? 0),
    enabled: !!userId,
    refetchInterval: 30_000,
  });

  const badgeFor = (badge?: TabConfig["badge"]): number => {
    if (badge === "student_profile") return pendingIncoming;
    if (badge === "parent_home") return pendingApprovals + pendingOutgoing;
    if (badge === "messages_unread") return unreadCount;
    return 0;
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const config = tabs.find(c => c.name === route.name)!;
        const badgeCount = badgeFor(config.badge);
        return {
          headerShown: false,
          tabBarShowLabel: true,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: palette.primary600,
          tabBarInactiveTintColor: "#9CA3AF",
          tabBarLabelStyle: styles.tabLabel,
          tabBarBadge: badgeCount > 0 ? (badgeCount > 99 ? "99+" : badgeCount) : undefined,
          tabBarBadgeStyle: styles.tabBadge,
          tabBarIcon: ({ focused, color }) => (
            <View style={[styles.tabIconWrapper, focused && styles.tabIconActive]}>
              <Ionicons
                name={(focused ? config.iconFilled : config.iconOutline) as any}
                size={22}
                color={color}
              />
            </View>
          ),
          tabBarLabel: t(config.labelKey as any),
        };
      }}
    >
      {tabs.map(c => (
        <Tab.Screen key={c.name} name={c.name} component={c.component} />
      ))}
    </Tab.Navigator>
  );
}

function StudentTabsNavigator() {
  return <TabsNavigator tabs={STUDENT_TABS} />;
}

function ParentTabsNavigator() {
  return <TabsNavigator tabs={PARENT_TABS} />;
}

function TeacherTabsNavigator() {
  return <TabsNavigator tabs={TEACHER_TABS} />;
}

// ParentRoomViewScreen takes its data as plain props rather than reading
// `route`/`navigation` itself (matching CareerDetailScreen's style) — this
// wrapper is the adapter between that and the Stack.Screen route params.
function ParentRoomViewRoute({ route, navigation }: any) {
  const { roomId, roomName, childId, childName } = route.params ?? {};
  return (
    <ParentRoomViewScreen
      roomId={roomId}
      roomName={roomName}
      childId={childId}
      childName={childName}
      onBack={() => navigation.goBack()}
    />
  );
}

// GroupSettingsScreen takes its data as plain props rather than reading
// `route`/`navigation` itself (matching ParentRoomViewRoute's adapter style)
// — this wrapper is the adapter between that and the Stack.Screen route params.
function GroupSettingsRoute({ route, navigation }: any) {
  const { roomId } = route.params ?? {};
  return (
    <GroupSettingsScreen
      roomId={roomId}
      onBack={() => navigation.goBack()}
    />
  );
}

// BattleReviewScreen takes battleId/userId as plain props — same adapter
// pattern as ParentRoomViewRoute/GroupSettingsRoute above.
function BattleReviewRoute({ route }: any) {
  const { battleId, userId } = route.params ?? {};
  return <BattleReviewScreen battleId={battleId} userId={userId} />;
}

// SubscriptionScreen takes onBack as a plain prop rather than reading
// navigation itself — same adapter pattern as BattleReviewRoute above.
function SubscriptionRoute({ navigation }: any) {
  return <SubscriptionScreen onBack={() => navigation.goBack()} />;
}

// ReferralScreen takes onBack as a plain prop and has zero navigation
// awareness of its own — same adapter pattern as SubscriptionRoute above.
// Previously only reachable via a ProfileScreen-hosted Modal with no
// Stack.Screen fallback at all; this is its first real navigator entry.
function ReferralRoute({ navigation }: any) {
  return <ReferralScreen onBack={() => navigation.goBack()} />;
}

// QuizScreen reads quizId/title from route params and takes onBack as a
// plain prop — its own internal `beforeRemove` listener (see QuizScreen.tsx)
// already guards hardware-back/swipe-back with the exit-confirmation dialog,
// so `onBack` here only needs to handle the explicit in-question "X" path.
function QuizRoute({ route, navigation }: any) {
  const { quizId, title } = route.params ?? {};
  return (
    <QuizScreen
      quizId={quizId ?? ""}
      title={title ?? "Quiz"}
      onBack={() => navigation.goBack()}
    />
  );
}

// BattleScreen takes `user` as a plain prop rather than reading the store
// itself — pull it from useAppSelector here instead of threading it through
// route params (params must be serializable for deep-linking).
function BattleRoute() {
  const user = useAppSelector(s => s.auth.user);
  return <BattleScreen user={user} />;
}

// CareerScreen takes `user` as a plain prop — same reasoning as BattleRoute.
function CareerRoute() {
  const user = useAppSelector(s => s.auth.user);
  return <CareerScreen user={user} />;
}

// RevisionScreen takes `userId` as a plain prop; `onOpenAITutor` is left
// unset here on purpose — now that AI Tutor is a real Stack.Screen, the
// wrapper just navigates there directly instead of threading a callback.
function RevisionRoute() {
  const navigation = useNavigation<any>();
  const user = useAppSelector(s => s.auth.user);
  return (
    <RevisionScreen
      userId={user?.id ?? ""}
      onOpenAITutor={() => navigation.navigate("AITutor")}
    />
  );
}

// PreviousYearPapersScreen's onOpenAITutor/onQuiz props previously opened
// Dashboard-hosted Modals; both now navigate to real Stack.Screens instead.
function PreviousYearPapersRoute() {
  const navigation = useNavigation<any>();
  return (
    <PreviousYearPapersScreen
      onOpenAITutor={() => navigation.navigate("AITutor")}
      onQuiz={(paper: any) => navigation.navigate("Quiz", { quizId: paper.id, title: paper.title })}
    />
  );
}

function tabsForRole(role: string): React.ComponentType {
  if (role === "parent") return ParentTabsNavigator;
  if (role === "teacher") return TeacherTabsNavigator;
  return StudentTabsNavigator;
}

export default function MainNavigator() {
  const role = useAppSelector(s => s.auth.user?.role?.toLowerCase() ?? "student");
  usePushNotifications();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="Tabs"
        component={tabsForRole(role)}
      />
      {/* Shared stack screens accessible from both roles */}
      <Stack.Screen name="Messages"        component={MessagesScreen}      options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="Leaderboard"     component={LeaderboardScreen}   options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="CareerHub"       component={CareerHubScreen}     options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="ParentRoomView"  component={ParentRoomViewRoute} options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="GroupSettings"   component={GroupSettingsRoute}  options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="Notifications"            component={NotificationsScreen}            options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="NotificationPreferences"  component={NotificationPreferencesScreen}  options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="ParentNotificationPrefs"  component={ParentNotificationPrefsScreen}  options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="Search"                   component={SearchScreen}                   options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="EduPointsShop"             component={EduPointsShopScreen}            options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="WeeklyReport"              component={WeeklyReportScreen}             options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="Saved"                     component={SavedScreen}                    options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="KnowledgeHub"               component={KnowledgeHubScreen}             options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="LevelProgress"             component={LevelProgressScreen}            options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="Feedback"                  component={FeedbackScreen}                 options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="ParentMeetings"            component={ParentMeetingsScreen}           options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="ParentCommunication"       component={ParentCommunicationScreen}      options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="StudentParentChat"         component={StudentMessagesScreen}          options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="LinkStudent"                component={LinkStudentScreen}              options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="StudyLimits"                component={StudyLimitsScreen}              options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="BattleReview"               component={BattleReviewRoute}              options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="Subscription"               component={SubscriptionRoute}              options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="Challenges"                 component={ChallengesScreen}                options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="ChallengeDetail"            component={ChallengeDetailScreen}           options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="Referral"                   component={ReferralRoute}                   options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="Quiz"                       component={QuizRoute}                       options={{ animation: "slide_from_bottom" }} />
      <Stack.Screen name="Battle"                     component={BattleRoute}                     options={{ animation: "slide_from_bottom" }} />
      <Stack.Screen name="Analytics"                  component={AnalyticsScreen}                 options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="Career"                     component={CareerRoute}                     options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="Roadmap"                    component={RoadmapScreen}                   options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="Revision"                   component={RevisionRoute}                   options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="PreviousYearPapers"         component={PreviousYearPapersRoute}         options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="AITutor"                    component={AITutorScreen}                   options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="VideoPlayer"                component={VideoPlayerScreen}               options={{ animation: "slide_from_bottom" }} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar:         { height: 65, paddingBottom: 8, paddingTop: 8, backgroundColor: "#fff", borderTopWidth: 0, elevation: 16, shadowColor: palette.primary600, shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12 },
  tabLabel:       { fontSize: 11, fontWeight: "600" },
  tabBadge:       { backgroundColor: "#DC2626", color: "#fff", fontSize: 10, fontWeight: "700", minWidth: 16, height: 16, lineHeight: 16, borderRadius: 8 },
  tabIconWrapper: { alignItems: "center", justifyContent: "center", padding: 4, borderRadius: 10 },
  tabIconActive:  { backgroundColor: palette.primary50 },
});
