# Runtime-плагины

[English](plugins.md) · [Русский](plugins.ru.md) · [Документация](README.ru.md)

Runtime-плагин CanvasTTY — это статический web-пакет, установленный из HTTPS GitHub-репозитория. Один плагин может добавить виджет HOME, перемещаемое приложение на канвасе, отдельное окно приложения или сразу несколько таких элементов. HTML, CSS и JavaScript плагина работают в Electron sandbox без Node.js.

## Модель доверия

Установка плагина разрешает стороннему browser-коду выполняться локально. CanvasTTY уменьшает поверхность риска, но не может сделать неизвестный код доверенным:

- CanvasTTY скачивает только tar-архив default branch по корневой ссылке GitHub-репозитория и никогда не запускает `npm install`, build hooks, нативные модули или scripts репозитория.
- В пакете запрещены symlink; лимит — 500 файлов или каталогов / 25 МБ, один отдаваемый ресурс — не больше 8 МБ.
- Iframe получает opaque sandbox origin, не видит parent DOM, `window.canvasTTY` и Node.js API.
- Узкий preload отдельного окна не открывает Node primitives и передаёт те же SDK-запросы через IPC с проверкой plugin/contribution по фактическому URL.
- Каждый привилегированный SDK-метод требует permission из manifest. Полный список разрешений показывается до подтверждения установки.
- Учётные данные провайдеров, PTY buffer, рабочие каталоги, сырые ответы API и файловая система не пересекают plugin boundary.
- Выключение или удаление плагина сразу прекращает отдачу его ресурсов и закрывает отдельные окна.

CanvasTTY не встраивает произвольные нативные окна ОС. Contribution `window` — это sandboxed `BrowserWindow`, которым владеет CanvasTTY. Native reparenting ненадёжен и непереносим между Wayland, macOS, Windows, разными DPI, popup и GPU surfaces.

## Структура пакета

В корне репозитория обязателен `canvastty.plugin.json`. Entry — относительный путь к готовому статическому HTML; inline scripts блокируются plugin CSP.

```text
canvastty.plugin.json
shared/plugin.css
widgets/status.html
widgets/status.js
apps/notes.html
apps/notes.js
windows/focus.html
windows/focus.js
```

Рабочий пример: [`examples/plugins/studio-kit`](../examples/plugins/studio-kit).
Для IDE доступны [JSON Schema manifest](canvastty-plugin.schema.json) и [TypeScript declarations SDK](plugin-api.d.ts).

## Manifest v1

```json
{
  "apiVersion": 1,
  "id": "com.example.studio-kit",
  "name": "Studio Kit",
  "version": "1.0.0",
  "description": "Небольшие поверхности CanvasTTY на реальных данных host.",
  "permissions": ["storage", "sessions:read", "launcher:open"],
  "contributions": [
    {
      "id": "session-status",
      "kind": "home-widget",
      "title": "Session status",
      "entry": "widgets/status.html",
      "defaultSize": { "columns": 4, "rows": 2 }
    },
    {
      "id": "notes",
      "kind": "canvas-app",
      "title": "Notes",
      "entry": "apps/notes.html",
      "defaultSize": { "width": 680, "height": 440 }
    },
    {
      "id": "focus",
      "kind": "window",
      "title": "Focus",
      "entry": "windows/focus.html",
      "defaultSize": { "width": 900, "height": 620 }
    }
  ]
}
```

ID плагина и contribution — стабильные ключи persistence: после публикации их нельзя переименовывать. Версия использует semantic version. HOME начинает с просторной логической сетки 16 × 12, сохраняя исходную композицию 12 × 8. В редакторе видимая граница растягивается до 48 × 36 без уменьшения ячеек, а при нехватке места новый виджет расширяет её автоматически. Canvas app использует world-space pixels и участвует в том же snapping, что терминальные карточки.

## Permissions

| Permission | Возможность SDK | Граница данных |
|:--|:--|:--|
| `storage` | `storage.get`, `storage.set` | Изолированное JSON-хранилище, 64 КБ на плагин |
| `sessions:read` | `sessions.list` | Только ID, provider, title, status, startedAt и exitCode |
| `limits:read` | `limits.get` | Тот же очищенный `LimitsSnapshot`, который использует HOME |
| `launcher:open` | `launcher.open` | Открывает штатную Focus Card или запуск терминала; не обходит пользовательский выбор |
| `external:open` | `external.open` | Передаёт ОС только явную HTTP(S)-ссылку |
| `media:library` | `media.*` | Только выбранные пользователем музыкальные папки; абсолютные пути не раскрываются, аудио отдаётся seekable-потоками `canvastty-media://` |
| `playlists:read` | `playlists.list`, `playlists.read` | Читает `.m3u`, `.m3u8` и `.pls` в разрешённой музыкальной папке, а `.json` — только в её `Playlists/`, до 4 МБ на файл |
| `playlists:write` | `playlists.write` | Атомарно записывает плейлист в каталог `Playlists/` разрешённой папки, до 4 МБ |
| `network` | browser `fetch` | Разрешает HTTPS и loopback в CSP; учётные данные CanvasTTY не прикрепляются |

Permission не открывает generic IPC. Неизвестные методы и permissions отклоняются.

## SDK

Подключите host SDK внешним script:

```html
<script src='canvastty-plugin://host/sdk.js'></script>
<script src='./index.js'></script>
```

SDK создаёт `window.CanvasTTYPlugin`:

```js
const host = window.CanvasTTYPlugin;

host.onContext(({ appearance, contribution }) => {
  document.documentElement.dataset.palette = appearance.palette;
  document.title = contribution.title;
});

const sessions = await host.request("sessions.list");
await host.storage.set("draft", { text: "Локально для этого плагина" });
const draft = await host.storage.get("draft");
await host.request("launcher.open", { provider: "codex" });
await host.request("window.open", { contributionId: "focus" });

const library = await host.media.pickLibrary();
if (library) {
  const audio = document.querySelector("audio");
  const tracks = await host.media.scanLibrary(library.id);
  if (audio) audio.src = tracks[0]?.streamUrl ?? "";
  const playlists = await host.playlists.list(library.id);
  const text = playlists[0] ? await host.playlists.read(library.id, playlists[0].id) : "";
  await host.playlists.write(library.id, "favorites.m3u8", text || "#EXTM3U\n");
}
```

Поддержаны `host.getContext`, `storage.*`, `sessions.list`, `limits.get`, `launcher.open`, `external.open`, `window.open`, `media.*` и `playlists.*`. `window.open` может открыть только contribution типа `window` из того же manifest.

Разрешения музыкальных библиотек сохраняются между перезапусками, перечисляются и отзываются только владеющим плагином. Сканирование пропускает symlink и возвращает относительные пути, метаданные и непрозрачные stream URL вместо абсолютного корня библиотеки. При удалении плагина все его разрешения на папки отзываются. Содержимое плейлиста возвращается как записано и не привязано к формату: плеер может использовать стандартные M3U/PLS или собственную JSON-схему; импортированный плейлист сам может содержать абсолютные пути.

### Как написать полноценный плеер-плагин

Локальному плееру обычно нужны:

```json
"permissions": ["storage", "media:library", "playlists:read", "playlists:write"]
```

Добавляйте `network` только для удалённых каталогов, радио, обложек или стримов, а `external:open` — только для явных ссылок, открываемых в системном браузере. `storage` предназначен для настроек плеера, избранного, очереди и небольших JSON-метаданных; сами аудиофайлы остаются в выбранных пользователем папках.

| Вызов SDK | Результат и назначение |
|:--|:--|
| `host.media.pickLibrary()` | Открывает системный выбор каталога и сохраняет разрешение; возвращает `{ id, name }` или `null` при отмене |
| `host.media.listLibraries()` | Восстанавливает разрешённые этому плагину библиотеки после перезапуска, не раскрывая абсолютные пути |
| `host.media.scanLibrary(libraryId)` | Рекурсивно возвращает до 20 000 поддерживаемых треков: ID, имя, относительный путь, размер, MIME type и `streamUrl` |
| `host.media.revokeLibrary(libraryId)` | Отзывает разрешение этого плагина на выбранную папку |
| `host.playlists.list(libraryId)` | Перечисляет до 2 000 доступных плейлистов внутри разрешённой библиотеки |
| `host.playlists.read(libraryId, playlistId)` | Возвращает исходный UTF-8 текст плейлиста размером до 4 МБ |
| `host.playlists.write(libraryId, name, content)` | Атомарно записывает `.m3u`, `.m3u8`, `.pls` или `.json` в каталог `Playlists/` библиотеки, до 4 МБ |

Сканируются аудиофайлы `.aac`, `.flac`, `.m4a`, `.mp3`, `.oga`, `.ogg`, `.opus`, `.wav` и `.webm`. `track.streamUrl` можно сразу назначить элементу `<audio>`: host поддерживает byte-range responses, поэтому определение длительности и перемотка работают. Плагин с `media:library` также может выполнить `fetch(track.streamUrl)`, если байты нужны для разбора метаданных в браузере. Полные overloads методов и result interfaces находятся в [`plugin-api.d.ts`](plugin-api.d.ts).

Рекомендуемый запуск: вызвать `listLibraries()`, предложить `pickLibrary()` только если разрешённых папок ещё нет, просканировать выбранную библиотеку, восстановить очередь и настройки из `storage`, затем получить и разобрать плейлисты. Отозванную или перемещённую папку показывайте явным состоянием «недоступно» и предложите выбрать её заново.

Context сообщает текущие locale и palette CanvasTTY. Локализация и внутренние стили — ответственность плагина. Плагин не должен выдумывать progress, sessions, status, limits или telemetry.

## Установка и управление

1. Опубликуйте готовый статический пакет в корне публичного GitHub-репозитория.
2. Откройте **Настройки → Плагины**.
3. Вставьте `https://github.com/owner/repository` и нажмите **Проверить**.
4. Прочитайте manifest и permissions, затем подтвердите **Установить**.
5. В том же разделе плагин можно включить, выключить, удалить, добавить или убрать его HOME widgets.
6. Откройте **Настройки → Оформление → Состав HOME** и нажмите **Редактировать HOME**, чтобы двигать плитки, менять их размер или тянуть правый нижний угол границы HOME. Плитка Settings сохраняется как аварийная точка входа; остальные системные и plugin tiles опциональны.

Установщик намеренно не принимает приватные репозитории, ссылки GitHub вида `/tree/branch/subdirectory` и репозитории, которым нужен build. Публикуйте готовый пакет в корне.

## Чек-лист автора

- Используйте только structured host data и явные loading/unavailable/error states.
- Запрашивайте минимальный набор permissions.
- Держите scripts во внешних файлах; inline script не выполнится.
- Не рассчитывайте на Node.js, filesystem paths, PTY history, provider tokens или parent DOM.
- Проверяйте HOME widget в минимальном заявленном размере и при zoom канваса.
- Проверяйте canvas app в semantic summary ниже `0.5×`.
- Проверяйте одинаковые SDK-вызовы внутри iframe и отдельного окна.
- При изменении host/example запускайте `npm test`, `npm run typecheck`, `npm run build`.
