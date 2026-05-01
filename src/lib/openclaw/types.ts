// Tipos centrais do OpenClaw Assistant

export type OCIntent =
  | "query_pending"
  | "create_student"
  | "register_payment"
  | "create_task"
  | "add_student_note"
  | "save_content_idea"
  | "unknown";

export type OCQueryType = "who_didnt_pay" | "overdue" | "today" | "general";

export type OCPaymentMethod =
  | "Pix" | "Dinheiro" | "Cartão" | "Transferência" | "Débito" | "Crédito";

// ─── Dados extraídos por intent ──────────────────────────────────

export type OCQueryPendingData = {
  queryType: OCQueryType;
};

export type OCCreateStudentData = {
  name: string;
  planName?: string;
  objective?: string;
  phone?: string;
  email?: string;
  paymentMethod?: OCPaymentMethod;
};

export type OCRegisterPaymentData = {
  studentName: string;
  amount: number;
  paymentMethod: OCPaymentMethod;
  date?: string;           // YYYY-MM-DD
  notes?: string;
};

export type OCCreateTaskData = {
  title: string;
  dueDate?: string;        // YYYY-MM-DD
  studentName?: string;
  type?: string;
};

export type OCAddStudentNoteData = {
  studentName: string;
  note: string;
};

export type OCSaveContentIdeaData = {
  idea: string;
};

export type OCExtractedData =
  | OCQueryPendingData
  | OCCreateStudentData
  | OCRegisterPaymentData
  | OCCreateTaskData
  | OCAddStudentNoteData
  | OCSaveContentIdeaData
  | Record<string, unknown>;

// ─── Classificação retornada pelo Claude ─────────────────────────

export type OCClassification = {
  intent: OCIntent;
  data: OCExtractedData;
  directResponse?: string; // para queries e unknown
};

// ─── Dados enriquecidos pós-validação ────────────────────────────

export type OCEnriched = {
  // Student info
  clientId?: string;
  clientName?: string;
  // Installment info (register_payment)
  installmentId?: string;
  installmentAmount?: number;
  installmentDueDate?: string;
  saleId?: string;
  // Plan info (create_student)
  planId?: string;
  planDisplayName?: string;
  planTotal?: number;
  planInstallments?: number;
  planDurationMonths?: number;
  // Content idea (save_content_idea)
  suggestedFormat?: string;
  hook?: string;
};

// ─── Resultado do processamento de uma mensagem ──────────────────

export type OCProcessResult = {
  response: string;
  intent: OCIntent;
  status: "executed" | "waiting_confirmation" | "failed" | "cancelled";
  eventId?: string;
  waitingConfirmation?: boolean;
};

// ─── Sessão pendente armazenada no banco ─────────────────────────

export type OCPendingSession = {
  id: string;
  intent: OCIntent;
  data: OCExtractedData;
  enriched: OCEnriched;
};
