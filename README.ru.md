<p align="center">
  <img src="docs/assets/canvastty-cover.png" alt="CanvasTTY — пространственный рабочий стол для локальных терминалов и AI-агентов" width="100%">
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.ru.md"><strong>Русский</strong></a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

<table>
  <tr>
    <td>
      <strong>Терминалы — это места, а не вкладки.</strong><br>
      CanvasTTY — пространственный Electron-десктоп для настоящих локальных PTY и CLI-сессий AI-агентов. Здесь есть фиксированная зона Home, живые терминалы на бесконечном канвасе и реальные лимиты провайдеров без выдуманной телеметрии.
    </td>
  </tr>
</table>

## Стек

| Desktop | Интерфейс | Терминал | Провайдеры |
|:--|:--|:--|:--|
| **Electron**<br>electron-vite | **React**<br>TypeScript | **xterm.js**<br>node-pty | **Codex**<br>Claude · Kimi |

## Один канвас, настоящие сессии

Запускайте shell или агента в каталоге проекта, двигайте и меняйте размер живого терминала, отдаляйтесь для смысловой навигации и возвращайтесь в Home к сессиям, лимитам, медиа и кнопкам запуска. CanvasTTY хранит состояние PTY в доверенном main-процессе и открывает renderer только типизированные разрешённые возможности.

## Установка

Скачайте public preview `0.8.x` из [GitHub Releases](https://github.com/howdeploy/CanvasTTY/releases): AppImage/deb для Linux, установщик/portable app для Windows и dmg/zip для macOS. Пакеты пока не подписаны и не notarized; сначала прочитайте про [установку и локальные данные](docs/installing-and-security.ru.md).

Или запустите из исходников:

```bash
npm install
npm run dev
```

## Документация

| Начать | Расширять CanvasTTY |
|:--|:--|
| [Центр документации](docs/README.ru.md) | [Создание виджетов](docs/widget-authoring.ru.md) |
| [Быстрый старт](docs/getting-started.ru.md) | [Метрики и телеметрия](docs/metrics-and-telemetry.ru.md) |
| [Установка, релизы и локальные данные](docs/installing-and-security.ru.md) | [Security policy](SECURITY.md) |
| [Архитектура](docs/ARCHITECTURE.md) | [UI-контракт](docs/UI_CONTRACT.md) |

> Сейчас CanvasTTY — Electron MVP. Пользовательские виджеты подключаются на уровне исходного кода; runtime-реестра плагинов пока нет.

## Быстрая проверка

```bash
npm test
npm run typecheck
npm run build
```
