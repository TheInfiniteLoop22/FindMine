// Matches GET /api/conversations/mine's per-conversation response shape
// (see src/app/api/conversations/mine/route.ts's inboxList).
export interface ConversationParticipant {
  id: string;
  displayName: string;
  photoUrl: string | null;
}

export interface MessagePreview {
  id: string;
  body: string;
  isSystem: boolean;
  createdAt: string;
  senderId: string | null;
  readAt: string | null;
}

export interface ConversationSummary {
  id: string;
  createdAt: string;
  otherUser: ConversationParticipant;
  lastMessage: MessagePreview | null;
  unreadCount: number;
}

// Matches one entry in GET /api/conversations/[id]/messages's `data.messages`
// (see that route's `safeMessages` map) - a single chat message, including
// the one-directional "shared my number" system fields.
export interface ConversationMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  body: string;
  isSystem: boolean;
  createdAt: string;
  readAt: string | null;
  sender: { id: string; displayName: string } | null;
}

// Matches GET /api/conversations/[id]/messages's full response shape
// (that route's returned `data` object) - the whole conversation payload
// this page fetches once and keeps in state, including the linked posts
// ("context chips") and the initial message list.
export interface ConversationDetail {
  id: string;
  otherUser: ConversationParticipant;
  links: {
    id: string;
    post: { id: string; title: string; type: string; status: string };
  }[];
  messages: ConversationMessage[];
}
