import type { BarrierReason, BarrierRule } from "../domain/types";

export const BARRIER_RULES: Record<BarrierReason, BarrierRule> = {
  no_slots: {
    id: "rule-no-slots",
    reason: "no_slots",
    sourceId: "demo-barriers-v1",
    title: "Уточнить доступный способ согласования",
    actionText:
      "В учебном случае запросите у выдавшей памятку организации, как согласовать следующий контакт, если запись недоступна. Приложение не видит талоны и не записывает на приём",
    limitation: "Не указаны реальные организация, регион или сроки",
  },
  unclear_process: {
    id: "rule-unclear-process",
    reason: "unclear_process",
    sourceId: "demo-barriers-v1",
    title: "Запросить порядок действий",
    actionText:
      "В учебном случае попросите пояснить, куда обратиться и какой организационный шаг выполнить первым. Можно скопировать учебный черновик вопроса",
    limitation: "Не является медицинским советом или официальным региональным порядком",
  },
  no_response: {
    id: "rule-no-response",
    reason: "no_response",
    sourceId: "demo-barriers-v1",
    title: "Уточнить канал и порядок ответа",
    actionText:
      "В учебном случае проверьте, тот ли канал указан в памятке, и запросите разъяснение порядка ответа. Приложение не отправляет сообщения и не обещает срок ответа",
    limitation: "Нет подключения к организации и контроля реального ответа",
  },
};
