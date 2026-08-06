# UI-контракт

[English](UI_CONTRACT.md) · [Русский](UI_CONTRACT.ru.md) · [简体中文](UI_CONTRACT.zh-CN.md)

Этот контракт сохраняет утверждённую концепцию MVP и не даёт ответственности фич расползаться.

## Зона Home

- HOME использует фиксированные логические ячейки `82 × 72` с промежутками `18px`, поэтому увеличение страницы не уменьшает существующие виджеты. Новый профиль начинает с `16 × 12`; исходная композиция остаётся в верхней левой области `12 × 8`, оставляя явный запас для плагинов. Сохраняемые граница и сетка видны только в Edit HOME, где правый нижний угол меняет область до безопасного потолка `48 × 36`.
- Широкая левая плитка содержит ровно строки лимитов Codex, Claude и Kimi. Каждая строка предпочитает самое длинное настоящее default quota window провайдера (weekly, если доступно) и только при необходимости переключается на другое реальное окно. Она показывает countdown до `resetsAt` этого окна и соответствующий usage rail. Значения короче суток используют `HH:MM`, длиннее — `Nд HHч`/`Nd HHh`. Длина окна остаётся в accessible metadata; недоступные данные подписаны и не получают выдуманный reset или percentage.
- Правая плитка — единственный список сессий. Viewport показывает три строки и прокручивается при большем числе реальных сессий, не отбрасывая их. Каждая строка показывает mark провайдера, локализованный semantic state и identity. Session duration и progress rails в стиле лимитов здесь не появляются.
- Часы — доминирующая средняя плитка и показывают только `HH:MM`. Соседняя media tile автономна: нажмите, чтобы выбрать/заменить image/GIF; удаление находится в самом виджете.
- Нижний dock содержит Terminal, Codex, Claude, Kimi и Browser. Settings — отдельная плитка. Browser открывает или фокусирует единственную встроенную карточку браузера и никогда не запускает внешний браузер.
- Любую default tile, кроме Settings, можно скрыть. Settings остаётся recovery entry point. Edit HOME показывает полную сетку и точную границу HOME, скрывает terminal/canvas-plugin windows и хранит изменения как draft до Save. Плитки двигаются без overlap и могут временно пересекать любую границу HOME; Save выключен, пока каждая плитка не окажется целиком внутри. Любая грань/угол меняет размер с сохранением противоположной грани; видимые подсказки есть только в верхнем левом и нижнем правом углах. Граница растёт/сжимается, не пересекая размещённые widgets. Добавление виджета автоматически расширяет HOME, если текущая область заполнена.
- Runtime HOME widgets используют те же tile bounds и zoom behavior. Их UI работает в sandboxed iframe и не имеет доступа к trusted renderer DOM или `window.canvasTTY`.

## Запуск и настройки

- Нажатие на провайдера открывает его Focus Card. Провайдер зафиксирован; второго выбора провайдера нет.
- Focus Card содержит только mark провайдера, project folder, profile Normal/YOLO, launch action и контекстное подтверждение опасности.
- Settings использует верхнюю полосу General, Appearance, Controls, Browser и Plugins. General владеет языком. Appearance — palette, background pattern, shortcut hint, системными HOME tiles и входом в HOME editor. Controls — click focus, hover focus, window snapping, edge panning, zoom sensitivity, wheel direction и keyboard shortcuts. Browser — agent access, восстановлением вкладок, downloads, редактированной activity и очисткой browser data. Plugins — install preview, permission review, installed-plugin list, enable/disable/uninstall и contribution actions. Media controls там не появляются.
- Click focus имеет явные режимы Off, Single click и Double click и по умолчанию выключен. Selection и видимая рамка работают даже без camera focus; режим double click никогда не прыгает камерой по первому клику.
- Selection эксклюзивен для терминалов и встроенного Browser: нажатие на пустой canvas снимает его. Выбранная живая поверхность удерживает keyboard focus и теряет его при deselect.
- Hover focus — отдельный, выключенный по умолчанию режим selection. После настраиваемой задержки (медленно `500ms`, обычно `250ms`, быстро `80ms`) терминал или встроенный Browser под указателем выбирается и получает keyboard focus; уход с карточки снимает selection через ту же задержку.
- Keyboard shortcuts переназначаются пользователем и сохраняются локально. Defaults: `Home` фокусирует Home, `F2` переименовывает выбранное окно терминала. Rename происходит inline в header и не пересоздаёт PTY. Компактная пассивная подсказка справа внизу canvas сразу отражает сохранённые bindings и скрывается в Appearance.
- Snapping включён по умолчанию и выключается без изменения существующих window bounds. Edge panning по умолчанию выключен и имеет slow/normal/fast speed. Направления колеса для terminal scroll и camera zoom настраиваются раздельно. По умолчанию колесо вниз прокручивает живой терминал вниз, а зум камеры сохраняет исходное направление CanvasTTY.

## Визуальная система

- Плоские крупные pastel tiles, сильный dark/light contrast, сдержанные тени; без декоративных micro-controls и поясняющего microcopy вокруг очевидных controls.
- Home рисуется `1:1`, если помещается текущая сохраняемая граница. Auto-fit использует дискретные шаги до `0.2×` и целые camera coordinates, чтобы borders и spacing dock оставались визуально ровными в больших plugin layouts.
- Системные actions используют локально сохранённые SVG из официального Lucide repository. Нельзя рисовать system icons вручную в TSX или добавлять icon runtime package.
- Provider marks используют неизменённые vendor assets. Их нельзя перерисовывать, перекрашивать, фильтровать или аппроксимировать. Raster mark Kimi не рисуется больше родных `48px`.
- Dots/grid — CSS patterns. Waves используют бесшовную SVG tile `assets/patterns/waves.svg`; radial gradients её не заменяют.
- Terminal cards сохраняют header `54px`. При нормальном масштабе header показывает provider mark и working directory, пока пользователь явно не переименует окно; custom title затем заменяет путь. Close — единственное window action и всегда видимо справа; maximize/fullscreen в canvas cards нет. Lifecycle dot в terminal chrome отсутствует.
- Ниже `0.5×` terminal cards переходят в semantic summary. Typography counter-scale увеличивается при отдалении камеры, чтобы одинаковые карточки сохраняли читаемую иерархию вместо мелкого xterm text.
- В semantic summary карточка становится navigation target канваса: wheel zooms camera вокруг неё, а нажатие всегда выбирает summary с видимой рамкой. Camera focus подчиняется только Off/Single click/Double click. При нормальном масштабе wheel снова принадлежит живому терминалу.
- Любая грань/угол terminal — resize target. Минимальный размер `420 × 260`; resize обновляет viewport xterm и сохраняет противоположную грань.
- Selection живого терминала следует за видимой позицией указателя при любом canvas zoom. При непустом выделении `Ctrl+C`/`Ctrl+Shift+C` или `Cmd+C` копирует; `Ctrl+Shift+V`/`Cmd+V` и `Shift+Insert` вставляют из system clipboard. Обычный `Ctrl+C` без выделения остаётся PTY interrupt. `Shift+Enter` отправляет line-break sequence (`ESC [ 13 ; 2 u`) в PTY вместо отправки строки.
- Canvas plugin apps используют ту же movable card grammar, header `54px`, resize/snap и semantic summary ниже `0.5×`. Contribution `window` открывает отдельное sandboxed окно под управлением CanvasTTY; произвольные native windows не встраиваются.
- Built-in Browser — одна movable/resizable core canvas card, а не plugin contribution. Она использует тот же внешний header `54px`, что и другие canvas cards: identity и hide-card action отделены от внутренней полосы вкладок ниже. Trusted DOM chrome владеет tabs/favicons, address/search, back/forward/reload, downloads, per-tab provider badges, site dialogs и явными Close tab/Close all. Скрытие карточки сохраняет вкладки и общий аутентифицированный Chromium profile. Ниже `0.5×`, в Edit HOME, за trusted dialogs/popovers и во время движения карточки или камеры native page скрывается и заменяется стабильной semantic surface, а не отстаёт от canvas и не перекрывает renderer UI.
- При включённом snapping drag/resize используют скрытую сетку `10px`, magnetic threshold `10px` для соседних edges/centers и постоянный gap `20px`.
- Wheel input принадлежит поверхности под указателем, если та действительно scrolls/consumes wheel. По умолчанию session list, terminal и Browser page сохраняют локальное владение колесом. Controls → Zoom over applications явно перенаправляет wheel input терминала и native Browser на камеру. Passive Home widgets — limits, clock, media, launcher — разрешают camera zoom, чтобы Home не сокращал usable zoom area.
- Canvas двигается RTS-style, пока указатель находится в пределах `56px` от viewport edge над пустым canvas; скорость линейно возрастает до `900px/s` на самой границе. Edge panning выключен по умолчанию и включается в Settings. Motion останавливается над interactive surfaces и во время drag-pan.
- Dialog close actions остаются внутри своей header/control row с одинаковым inset и не перекрывают field, outline или panel boundary.

## Приёмочные проверки

- Нет собственных `<svg>` или `<path>` в React TSX.
- В Settings нет media picker или media-fit selector.
- В `AgentLaunchDialog` нет provider picker.
- В canvas card нет maximize/fullscreen.
- Нет выдуманных counts, percentages, reset timers, determinate progress или placeholder sessions.
- Plugin install всегда показывает validated manifest и requested permissions до подтверждения; repository scripts не выполняются.
- Новый PTY начинается как `idle`. Только structured provider lifecycle signal может отметить его `working` или `needs_approval`; PTY existence и terminal text не являются activity signals.
- `needs_approval` показывается только после structured provider-adapter signal; terminal output не парсится для его выдумывания.
- Home, Focus Card, Settings, минимум один живой терминал и встроенный Browser проверены в изолированном настоящем Electron после build.
