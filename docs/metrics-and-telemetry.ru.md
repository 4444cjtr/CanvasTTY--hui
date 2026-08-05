# Метрики и телеметрия

[English](metrics-and-telemetry.md) · [Русский](metrics-and-telemetry.ru.md) · [简体中文](metrics-and-telemetry.zh-CN.md) · [Документация](README.ru.md)

CanvasTTY сначала решает вопрос правдивости телеметрии и только потом — её визуализации. Красивая progress rail неверна, если источник не способен доказать значение.

## Не смешивайте разные измерения

| Измерение | Смысл | Пример источника |
|:--|:--|:--|
| Лимит подписки | Использование внутри окна провайдера и время его сброса | Официальный account usage endpoint или структурированный CLI-протокол |
| Токены сессии | Input, output и cache tokens, относящиеся к одной сессии | Структурированные lifecycle/usage events провайдера |
| Стоимость | Списанная сумма для известной модели и источника цены | Официальная billing/usage запись, а не умножение токенов на угаданную цену |
| Прошедшее время | Время от известного timestamp сессии | Локальные часы плюс реальные lifecycle timestamps |
| Активность | Работает ли агент или ждёт разрешения | Структурированный lifecycle-сигнал провайдера |

Процент подписки нельзя получить из токенов сессии. Число токенов само по себе не доказывает стоимость. Вывод PTY не доказывает активность.

## Что уже есть

[`LimitsService`](../src/main/services/LimitsService.ts) читает окна подписки через структурированные адаптеры:

- Codex — через app-server протокол установленной CLI.
- Claude и Kimi — через read-only usage endpoints, если credentials и тип аккаунта установленной CLI это поддерживают.
- Кэш на 60 секунд и stale fallback после ранее успешного чтения.
- Очищенные snapshots `available`, `stale` или `unavailable`; сырые credentials и ответы провайдера не пересекают IPC.

CanvasTTY не парсит terminal UI провайдера ради лимитов. Неподдерживаемый тип подписки остаётся явно недоступным.

Публичного API учёта токенов каждой сессии в CanvasTTY **пока нет**. Модель ниже — безопасный шаблон расширения, а не заявление о готовой телеметрии.

## Приоритет источников

Берите самый высокий доступный уровень и останавливайтесь, если доверять нечему:

1. Структурированное event или локальный протокол провайдера, привязанный к session ID.
2. Официальное usage API со стабильными идентификаторами.
3. Документированный CLI JSON для автоматизации.
4. `unavailable` с конкретной причиной.

Нельзя скрейпить ANSI-output, угадывать работу по тексту терминала, оценивать токены по символам и называть их фактическими либо передавать auth-данные в renderer. Оценка допустима только как отдельно названная величина с видимыми методом и неопределённостью; она не заменяет реальное usage-поле.

## Предлагаемый контракт токенов сессии

Discriminated union не даёт недоступным данным притвориться нулями:

```ts
type SessionMetricSource =
  | "provider-event"
  | "provider-usage-api"
  | "cli-json";

type SessionMetricUnavailableReason =
  | "unsupported-provider"
  | "not-authenticated"
  | "not-reported"
  | "timeout"
  | "protocol-error";

interface SessionTokenValues {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  totalTokens: number;
}

type SessionTokenUsage =
  | {
      sessionId: string;
      provider: AgentProviderId;
      state: "available";
      source: SessionMetricSource;
      fetchedAt: number;
      values: SessionTokenValues;
    }
  | {
      sessionId: string;
      provider: AgentProviderId;
      state: "stale";
      source: SessionMetricSource;
      fetchedAt: number;
      failedAt: number;
      reason: SessionMetricUnavailableReason;
      values: SessionTokenValues;
    }
  | {
      sessionId: string;
      provider: AgentProviderId;
      state: "unavailable";
      checkedAt: number;
      reason: SessionMetricUnavailableReason;
    };
```

Оставляйте вложенные поля nullable, если источник надёжно сообщает только total. Не вычисляйте отсутствующее разделение input/output. До создания snapshot проверьте каждое число на конечность, неотрицательность и безопасный диапазон.

## Поток данных токен-виджета

```text
структурированный источник провайдера
        ↓
адаптер main-процесса
  validate · normalize · cache · bind to session ID
        ↓
очищенный SessionTokenUsage snapshot
        ↓ разрешённый IPC + typed preload
чистый selector renderer
        ↓
виджет Home или summary карточки терминала
```

Main-адаптер владеет авторизацией, timeout, provider-specific schemas, дедупликацией и очисткой. Renderer владеет только представлением и локальным выбором. Если провайдер не умеет связать usage с точной сессией CanvasTTY, нельзя приписывать ей account-wide токены.

## Поведение виджета

- Показывайте компактный числовой total только в `available` или `stale`.
- Помечайте stale, не заменяя его нулём; timestamp источника должен быть доступен в assistive text или деталях.
- Вместо пустой полоски выводите локализованную причину недоступности.
- Determinate progress rail допустим только с реальным denominator. У обычного token usage его нет.
- Не смешивайте lifetime/session total с окнами квоты провайдера.
- Пассивная Home-метрика не должна перехватывать wheel.
- Ограничивайте историю числом событий или временем. Агрегация не должна бесконечно увеличивать память renderer или persisted state.

## Приватность и безопасность

- Возвращайте counts и минимум metadata источника, но не prompts, responses, terminal buffers, account tokens, cookies или raw payloads.
- Читайте credentials только в доверенном main-процессе и отправляйте их только на соответствующий официальный endpoint.
- Редактируйте stderr subprocess перед логированием: provider tools могут вывести чувствительные пути и идентификаторы.
- Не собирайте телеметрию каждого нажатия. Предпочитайте агрегаты провайдера или редкие lifecycle events.
- Явно ограничивайте network timeout и завершение subprocess, чтобы зависший адаптер не блокировал выход.

## Кэш и свежесть

Выбирайте свежесть по смыслу, а не ради анимации. Квота подписки может терпеть минутный кэш; токены сессии можно обновлять по структурированному message/completion event. Дедуплицируйте параллельные refresh. После временной ошибки сохраняйте последний валидный snapshot как `stale`, но не бессрочно без видимого возраста или expiry policy.

## Матрица тестов

| Область | Случаи |
|:--|:--|
| Нормализация | полный payload, только total, ноль токенов, malformed/negative/non-finite значения |
| Identity | правильная привязка сессии, неизвестная сессия, provider mismatch, account-wide ответ без session key |
| Состояние | loading, available, stale fallback, unavailable reason, ошибка первого чтения |
| Lifecycle | дедупликация refresh, timeout, очистка subprocess, удаление сессии |
| Безопасность | в snapshot/logs нет credentials и raw payload, только allow-listed IPC |
| Представление | нет fake denominator, stale сохранён, unavailable локализован, wheel пассивного виджета не перехвачен |

Запустите узкие unit-тесты адаптеров и selectors, затем `npm test`, `npm run typecheck` и `npm run build`. После этого проверьте настоящий виджет в Electron в обычном масштабе и при отдалении.

Размещение реализации и визуальные правила: [Создание виджетов](widget-authoring.ru.md).
