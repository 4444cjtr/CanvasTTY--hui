# Установка, релизы и локальные данные

[English](installing-and-security.md) · [Русский](installing-and-security.ru.md) · [简体中文](installing-and-security.zh-CN.md) · [Документация](README.ru.md)

## Пользовательские пакеты

Каждый tag `v*` запускает нативную сборку на GitHub-hosted runner для трёх ОС:

| Платформа | Артефакты | Особенности |
|:--|:--|:--|
| Linux | AppImage, deb | AppImage работает без установки; deb интегрируется в Debian-based desktop |
| Windows | NSIS installer, portable executable | Установщик позволяет выбрать каталог и создаёт ярлыки Start Menu/Desktop |
| macOS | dmg, zip | Оба содержат графический `.app` bundle |

Скачивайте файлы только со страницы [GitHub Releases](https://github.com/howdeploy/CanvasTTY/releases) этого репозитория. Линия `0.8.x` — public preview без коммерческих code-signing certificates и Apple notarization. Поэтому Windows SmartScreen и macOS Gatekeeper могут предупредить о неизвестном разработчике. Перед подтверждением предупреждения проверьте tag релиза и имя артефакта.

## Что попадает в приложение

В `electron-builder.yml` задан явный allowlist: production-бандлы из `out/`, `package.json` и необходимые production dependencies. Документы исходников, `.env`, локальные agent/planning folders, логи, настройки, credentials и release workspace в пакет не копируются.

`node-pty` пересобирается на соответствующем GitHub runner, поэтому Linux, Windows и macOS получают нативный модуль для своей ОС. Пакет одной системы нельзя просто переименовать в сборку другой.

## Только локальные пользовательские данные

| Данные | Место и срок жизни |
|:--|:--|
| Настройки CanvasTTY | Персональный Electron `userData` (`~/.config/canvastty` в типичном Linux, `%APPDATA%\canvastty` в Windows, `~/Library/Application Support/canvastty` в macOS) |
| Credentials провайдеров | Локальное хранилище установленной Codex, Claude или Kimi CLI; CanvasTTY его не копирует |
| PTY scrollback | Ограниченная память main-процесса живой сессии приложения; в репозиторий не сохраняется |
| Медиа Home | Исходный локальный файл пользователя; настройки хранят только локальный путь |
| Логи | Только локальные stdout/stderr; у CanvasTTY нет удалённого сборщика логов или собственного telemetry endpoint |

Точный `userData` зависит от конфигурации ОС. CanvasTTY запрашивает правильный персональный каталог у Electron и никогда не использует checkout исходников как runtime storage.

## Граница credentials

Credentials читаются только в доверенном main-процессе, когда они нужны запросу квоты с проверяемым источником. Они отправляются только соответствующему endpoint провайдера, не логируются, не сохраняются CanvasTTY и не пересекают typed preload bridge. Loopback-токен Kimi остаётся в памяти процесса, а stderr дочернего процесса отбрасывается.

Через IPC могут пройти только очищенные проценты, метаданные окна, timestamps и явные причины недоступности. Сырые ответы провайдера, bearer headers, cookies и credential files — не могут.

## Защита репозитория

```bash
npm run audit:secrets
npm test
```

Аудит ищет высокосигнальные форматы provider/cloud tokens, блоки private key, захардкоженные присваивания secrets, чувствительные имена файлов и персональные абсолютные home paths. `.gitignore` исключает локальный agent-контекст, planning data, env, credentials, логи, настройки, dependencies и сгенерированные пакеты. CI запускает аудит до build, а release job — ещё раз до упаковки.

Ни один сканер не идеален. Не коммитьте действующий секрет «на минуту». Если он попал в Git history, сначала отзовите его, затем очистите историю до публикации.

## Локальная сборка пакета

```bash
npm install
npm run package
```

`npm run package` создаёт распакованное приложение для текущей ОС. Платформенные scripts создают установщики:

```bash
npm run package:linux
npm run package:win
npm run package:mac
```

Запускайте каждый script на соответствующей ОС. Cross-compilation не считается доказательством совместимости, потому что `node-pty` — нативный модуль.

## Чек-лист релиза

1. Убедитесь, что `package.json` и tag содержат одну semantic version.
2. Запустите secret audit, тесты, typecheck, production build и пакет для текущей ОС.
3. Проверьте настоящее упакованное приложение и allowlist содержимого пакета.
4. Отправьте `vX.Y.Z` и дождитесь всех трёх package jobs в GitHub Actions.
5. Считайте автоматически созданный релиз prerelease, пока не пройдены проверки на реальных Linux, Windows и macOS устройствах.

Правила безопасного сообщения об уязвимости: [Security policy](../SECURITY.md).
