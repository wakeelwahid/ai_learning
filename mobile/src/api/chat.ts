import client from "./client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatRoom {
  room_id:        string;
  room_name:      string;
  is_group:       boolean;
  members:        RoomMember[];
  last_message?:  LastMessage;
  unread_count:   number;
  updated_at:     string;
}

export interface RoomMember {
  user_id:   string;
  full_name: string;
  is_online: boolean;
  avatar_url?: string | null;
  is_admin?:  boolean;
}

export interface LastMessage {
  content:    string;
  sender_id:  string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  message_id:        string;
  room_id:           string;
  sender_id:         string;
  sender_name:       string;
  content:           string;
  created_at:        string;
  status:            "sent" | "delivered" | "read";
  reply_to_id?:      string | null;
  reply_to_preview?: ReplyPreview | null;
  reactions:         Reaction[];
}

export interface ReplyPreview {
  message_id:  string;
  content:     string;
  sender_name: string;
}

export interface Reaction {
  emoji:    string;
  count:    number;
  user_ids: string[];
}

export interface StudentSearchResult {
  user_id:            string;
  full_name:          string;
  school_name:        string | null;
  class_name?:        string | null;
  class_number?:      number | null;
  board?:             string | null;
  avatar_url?:        string | null;
  friendship_status:  "none" | "pending_sent" | "pending_received" | "friends";
}

export interface StudentDirectoryPage {
  results:  StudentSearchResult[];
  page:     number;
  limit:    number;
  total:    number;
  has_more: boolean;
}

export interface FriendRequest {
  request_id: string;
  // For incoming rows this is the sender; for outgoing rows the recipient.
  from_user:  { user_id: string; full_name: string; school_name: string | null; avatar_url?: string | null };
  created_at: string;
  mutual_friends_count?: number;
  direction?: "incoming" | "outgoing";
}

// ─── API calls ────────────────────────────────────────────────────────────────

// The backend's GET /chat/rooms returns {id, type, name, other_user,
// is_other_online, unread_count, last_message, created_at} — a different
// shape from this module's ChatRoom (room_id/room_name/is_group/members[]),
// which every chat screen consumes. This adapter bridges the two so the
// screens keep working against the real payload (previously room_id/
// is_group/members were silently undefined, breaking DM names, keys and
// group detection).
function toChatRoom(r: any, myId: string): ChatRoom {
  const isGroup: boolean = r.is_group ?? (r.type ? r.type !== "direct" : false);
  const members: RoomMember[] = Array.isArray(r.members) && r.members.length
    ? r.members.map((m: any) => ({
        user_id: m.user_id,
        full_name: m.full_name ?? "Student",
        // Presence is only tracked per-DM-counterpart on the rooms endpoint;
        // group member rows don't carry it.
        is_online: m.user_id === r.other_user?.user_id ? !!r.is_other_online : !!m.is_online,
        avatar_url: m.avatar_url ?? null,
        is_admin: !!m.is_admin,
      }))
    : r.other_user
    ? [{
        user_id: r.other_user.user_id,
        full_name: r.other_user.full_name ?? "Student",
        is_online: !!r.is_other_online,
        avatar_url: r.other_user.avatar_url ?? null,
      }]
    : [];
  return {
    room_id: r.room_id ?? r.id,
    room_name: r.room_name ?? r.name ?? r.other_user?.full_name ?? "Chat",
    is_group: isGroup,
    members,
    last_message: r.last_message
      ? {
          content: r.last_message.content ?? "",
          sender_id: r.last_message.sender_id,
          created_at: r.last_message.created_at,
          updated_at: r.last_message.updated_at ?? r.last_message.created_at,
        }
      : undefined,
    unread_count: r.unread_count ?? 0,
    updated_at: r.updated_at ?? r.last_message?.created_at ?? r.created_at ?? "",
  };
}

// Backend message rows use `id` + a reactions dict; the app's ChatMessage uses
// `message_id` + a Reaction[] — bridge in one place. Exported because the
// chat WebSocket's `new_message` events carry the same backend shape.
export function toChatMessage(m: any): ChatMessage {
  const reactions: Reaction[] = Array.isArray(m.reactions)
    ? m.reactions
    : Object.entries(m.reactions ?? {}).map(([emoji, v]: [string, any]) => ({
        emoji,
        count: v?.count ?? 0,
        user_ids: v?.reacted_by ?? v?.user_ids ?? [],
      }));
  return {
    message_id: m.message_id ?? m.id,
    room_id: m.room_id,
    sender_id: m.sender_id,
    sender_name: m.sender_name ?? "",
    content: m.content ?? "",
    created_at: m.created_at,
    status: m.status ?? "sent",
    reply_to_id: m.reply_to_id ?? null,
    reply_to_preview: m.reply_to_preview ?? null,
    reactions,
  };
}

export const chatApi = {
  getRooms: (userId: string) =>
    client
      .get<any[]>("/v1/users/chat/rooms", { params: { user_id: userId } })
      .then((res) => ({ ...res, data: (res.data ?? []).map((r) => toChatRoom(r, userId)) })),

  // Messages — the backend REQUIRES user_id as a query param (422 without it)
  // and returns an envelope {messages: [...]} whose rows use `id` and a
  // reactions DICT ({emoji: {count, reacted_by}}). Normalized here to this
  // module's ChatMessage shape (message_id + Reaction[]), same single-adapter
  // approach as getRooms.
  getMessages: (roomId: string, userId: string, before?: string, limit = 40) =>
    client
      .get<any>(`/v1/users/chat/rooms/${roomId}/messages`, {
        params: { user_id: userId, ...(before ? { before } : {}), limit },
      })
      .then((res) => {
        const raw: any[] = Array.isArray(res.data) ? res.data : res.data?.messages ?? [];
        return { ...res, data: raw.map(toChatMessage) };
      }),

  sendMessage: (roomId: string, senderId: string, content: string, replyToId?: string) =>
    client
      .post<any>(`/v1/users/chat/rooms/${roomId}/messages`, {
        sender_id: senderId,
        content,
        ...(replyToId ? { reply_to_id: replyToId } : {}),
      })
      .then((res) => ({ ...res, data: toChatMessage(res.data ?? {}) })),

  // last_message_id is an OPTIONAL UUID server-side — omit it entirely when
  // absent ("" fails Pydantic UUID validation with a 422 before the handler's
  // own empty-string tolerance can run); omitted = mark ALL unread as read.
  markRead: (roomId: string, userId: string, lastMessageId?: string) =>
    client.post(`/v1/users/chat/rooms/${roomId}/read`, {
      user_id: userId,
      ...(lastMessageId ? { last_message_id: lastMessageId } : {}),
    }),

  // Reactions — path is /chat/messages/{id}/reactions, not via room
  reactToMessage: (messageId: string, userId: string, emoji: string) =>
    client.post(`/v1/users/chat/messages/${messageId}/reactions`, { user_id: userId, emoji }),

  // Group creation — POST /rooms/group
  createGroupRoom: (name: string, memberIds: string[], createdBy: string) =>
    client.post<ChatRoom>("/v1/users/chat/rooms/group", {
      name,
      member_ids: memberIds,
      created_by: createdBy,
    }),

  addMember: (roomId: string, userId: string, addedBy: string) =>
    client.post(`/v1/users/chat/rooms/${roomId}/members`, { user_id: userId, added_by: addedBy }),

  // Group admin actions (server-enforced: admin-only rename/remove; any
  // member may remove THEMSELVES to leave, except the admin).
  renameGroup: (roomId: string, name: string) =>
    client.patch<{ room_id: string; name: string }>(`/v1/users/chat/rooms/${roomId}`, { name }),

  // Delete the whole group — group admin or platform admin only.
  deleteGroup: (roomId: string) =>
    client.delete<{ deleted: boolean; room_id: string }>(`/v1/users/chat/rooms/${roomId}`),

  removeGroupMember: (roomId: string, memberId: string) =>
    client.delete<{ room_id: string; removed: string; left: boolean }>(
      `/v1/users/chat/rooms/${roomId}/members/${memberId}`
    ),

  // Direct room — backend creates it on friend-request accept; find it in rooms list
  createDirectRoom: (targetUserId: string, myUserId: string) =>
    client.get<any[]>("/v1/users/chat/rooms", { params: { user_id: myUserId } })
      .then((res) => {
        const rooms = (res.data ?? []).map((r) => toChatRoom(r, myUserId));
        const room = rooms.find(
          (r) => !r.is_group && r.members.some((m) => m.user_id === targetUserId)
        );
        if (!room) throw new Error("No direct room found. Accept a friend request first.");
        return { ...res, data: room };
      }),

  // Student directory + search. Empty query = paginated DISCOVER list of all
  // registered students (newest first); non-empty = name/school search.
  // The backend returns {results, page, limit, total, has_more} and names the
  // relationship field `friend_status` — normalized here to this module's
  // `friendship_status` so screens keep one spelling.
  searchStudents: (query: string, userId: string, page = 1, limit = 20) =>
    client
      .get<any>("/v1/users/chat/search", {
        params: { q: query, user_id: userId, page, limit },
      })
      .then((res) => ({
        ...res,
        data: {
          page: res.data?.page ?? page,
          limit: res.data?.limit ?? limit,
          total: res.data?.total ?? 0,
          has_more: !!res.data?.has_more,
          results: ((res.data?.results ?? []) as any[]).map((s) => ({
            ...s,
            friendship_status: s.friendship_status ?? s.friend_status ?? "none",
          })) as StudentSearchResult[],
        } as StudentDirectoryPage,
      })),

  // Friend requests — the backend rows are {id, from_profile|other_profile,
  // mutual_friends_count, created_at, direction}; normalized here to this
  // module's {request_id, from_user, ...} shape (screens read that spelling —
  // previously the raw payload left request_id/from_user undefined, so the
  // Requests tab could never confirm/reject anything).
  getFriendRequests: (userId: string, direction: "incoming" | "outgoing" = "incoming") =>
    client
      .get<any[]>("/v1/users/chat/friend-requests", {
        params: { user_id: userId, direction },
      })
      .then((res) => ({
        ...res,
        data: ((res.data ?? []) as any[]).map((r) => {
          const profile = r.from_user ?? r.other_profile ?? r.from_profile ?? {};
          return {
            request_id: r.request_id ?? r.id,
            from_user: {
              user_id: profile.user_id ?? (direction === "incoming" ? r.from_user_id : r.to_user_id),
              full_name: profile.full_name ?? "Student",
              school_name: profile.school_name ?? null,
              avatar_url: profile.avatar_url ?? null,
            },
            created_at: r.created_at,
            mutual_friends_count: r.mutual_friends_count ?? 0,
            direction: r.direction ?? direction,
          };
        }) as FriendRequest[],
      })),

  // Accepted friends of the authenticated caller — the ONLY people who can be
  // added to a group (server-enforced). Normalized to the StudentSearchResult
  // shape so pickers reuse the same row components.
  getFriends: () =>
    client.get<any[]>("/v1/community/friends").then((res) => ({
      ...res,
      data: ((res.data ?? []) as any[]).map((f) => ({
        user_id: f.user_id,
        full_name: f.full_name ?? "Student",
        school_name: f.school_name ?? null,
        class_number: f.class_number ?? null,
        avatar_url: f.avatar_url ?? null,
        friendship_status: "friends",
      })) as StudentSearchResult[],
    })),

  // Pending incoming count — Redis-cached server-side; cheap to poll for the
  // Requests badge.
  getFriendRequestCount: (userId: string) =>
    client.get<{ count: number }>("/v1/users/chat/friend-requests/count", {
      params: { user_id: userId },
    }),

  // Cancel a PENDING request you sent (Facebook's "Cancel request").
  cancelFriendRequest: (requestId: string) =>
    client.delete(`/v1/users/chat/friend-requests/${requestId}`),

  sendFriendRequest: (fromUserId: string, toUserId: string) =>
    client.post("/v1/users/chat/friend-requests", {
      from_user_id: fromUserId,
      to_user_id:   toUserId,
    }),

  // status must be "accepted" or "rejected" to match the backend enum
  respondFriendRequest: (
    requestId: string,
    status: "accepted" | "rejected",
    userId: string,
  ) =>
    client.patch(`/v1/users/chat/friend-requests/${requestId}`, { status, user_id: userId }),

  getUnreadCount: (userId: string) =>
    client.get<{ unread_count: number }>("/v1/users/messages/unread-count", {
      params: { user_id: userId },
    }),

  parentMonitor: (childId: string, parentId: string) =>
    client.get<ChatRoom[]>(`/v1/users/chat/parent/monitor/${childId}`, {
      params: { parent_user_id: parentId },
    }),

  parentRoomMessages: (childId: string, roomId: string, parentId: string) =>
    client.get<ChatMessage[]>(`/v1/users/chat/parent/monitor/${childId}/rooms/${roomId}`, {
      params: { parent_user_id: parentId },
    }),

  getReactions: (messageId: string, userId: string) =>
    client.get<Reaction[]>(`/v1/users/chat/messages/${messageId}/reactions`, {
      params: { user_id: userId },
    }),
};
