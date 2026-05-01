// Tipos centrais do WhatsApp Assistant

export type Intent =
  | "create_task"
  | "register_payment"
  | "list_tasks"
  | "day_summary"
  | "query_pending"
  | "create_expense"
  | "mark_paid"
  | "unknown";

export type QueryType = "who_didnt_pay" | "overdue" | "today" | "general";

export type PaymentMethod = "Pix" | "Dinheiro" | "Cartão" | "Transferência" | "Débito" | "Crédito";

// Dados extraídos por intent
export type CreateTaskData = {
  title: string;
  dueDate?: string;         // YYYY-MM-DD
  studentName?: string;
  type?: string;
};

export type RegisterPaymentData = {
  studentName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  date?: string;            // YYYY-MM-DD
  notes?: string;
};

export type QueryPendingData = {
  queryType: QueryType;
};

export type CreateExpenseData = {
  description: string;
  amount: number;
  category: string;
  dueDate?: string;
};

export type MarkPaidData = {
  description: string;
};

export type ExtractedData =
  | CreateTaskData
  | RegisterPaymentData
  | QueryPendingData
  | CreateExpenseData
  | MarkPaidData
  | Record<string, unknown>;

// Resultado da classificação Claude
export type ClassificationResult = {
  action: Intent;
  data: ExtractedData;
  response: string;         // Para ações diretas (queries). Vazio para ações com confirmação.
};

// Dados de uma sessão pendente armazenada
export type PendingSession = {
  id: string;
  action: Intent;
  data: ExtractedData;
  // Dados enriquecidos com IDs do banco
  enriched?: {
    clientId?: string;
    clientName?: string;
    installmentId?: string;
    installmentAmount?: number;
    installmentDueDate?: string;
    saleId?: string;
  };
};

// Resultado do processamento de uma mensagem
export type ProcessResult = {
  response: string;
  intent: Intent;
  status: "executed" | "waiting_confirmation" | "failed" | "cancelled";
  eventId?: string;
};
