/**
 * Минимальный клиент Voximplant Management API.
 *
 * Документация: https://voximplant.com/docs/references/httpapi
 *
 * Используем HTTP-API (а не их Node SDK), чтобы не тащить лишнюю зависимость.
 * Аутентификация — через `account_id` + `api_key` в query string.
 */

const API_BASE = "https://api.voximplant.com/platform_api";

export type VoximplantConfig = {
  accountId: string;
  apiKey: string;
};

export type StartScenariosArgs = {
  /** ID правила в Application, к которому привязан scenario.js */
  ruleId: number;
  /**
   * customData, который попадёт в VoxEngine.customData() внутри сценария.
   * Здесь мы передаём номер абонента, callId, wsUrl и т.д.
   */
  customData: Record<string, unknown>;
  /** Опционально: дать звонку имя — отображается в логах Voximplant. */
  scriptCustomData?: string;
};

export type StartScenariosResult = {
  ok: boolean;
  mediaSessionAccessUrl?: string;
  callSessionHistoryId?: number;
  errorCode?: number;
  errorMsg?: string;
  raw: unknown;
};

export class VoximplantClient {
  constructor(private readonly cfg: VoximplantConfig) {}

  /**
   * Запустить сценарий — это и есть «начать исходящий звонок» в нашем флоу.
   *
   * Документация метода: https://voximplant.com/docs/references/httpapi/scenarios#startscenarios
   */
  async startScenarios(args: StartScenariosArgs): Promise<StartScenariosResult> {
    const params = new URLSearchParams({
      account_id: this.cfg.accountId,
      api_key: this.cfg.apiKey,
      rule_id: String(args.ruleId),
      script_custom_data: JSON.stringify(args.customData),
    });

    const res = await fetch(`${API_BASE}/StartScenarios/?${params.toString()}`, {
      method: "POST",
    });

    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = { error: { code: -1, msg: `non-JSON response, http=${res.status}` } };
    }

    if (data?.error) {
      return {
        ok: false,
        errorCode: data.error.code,
        errorMsg: data.error.msg,
        raw: data,
      };
    }

    return {
      ok: true,
      mediaSessionAccessUrl: data?.media_session_access_url,
      callSessionHistoryId: data?.call_session_history_id,
      raw: data,
    };
  }

  /**
   * Получить статус звонка по callSessionHistoryId.
   * Доступно через минуту-две после начала звонка.
   * https://voximplant.com/docs/references/httpapi/history#getcallhistory
   */
  async getCallStatus(callSessionHistoryId: number): Promise<unknown> {
    const params = new URLSearchParams({
      account_id: this.cfg.accountId,
      api_key: this.cfg.apiKey,
      call_session_history_id: String(callSessionHistoryId),
      with_records: "true",
    });
    const res = await fetch(`${API_BASE}/GetCallHistory/?${params.toString()}`);
    return res.json();
  }
}

/** Создать клиент из переменных окружения. Бросает, если не сконфигурировано. */
export function createVoximplantClient(): VoximplantClient {
  const accountId = process.env.VOXIMPLANT_ACCOUNT_ID;
  const apiKey = process.env.VOXIMPLANT_API_KEY;
  if (!accountId || !apiKey) {
    throw new Error(
      "Voximplant не сконфигурирован. Добавьте VOXIMPLANT_ACCOUNT_ID и VOXIMPLANT_API_KEY в .env.local",
    );
  }
  return new VoximplantClient({ accountId, apiKey });
}
