# Again4k — монитор канала (бесплатно, без карты, без своего сервера)

Как это работает: GitHub сам каждые ~10 минут запускает `poll.js`, тот спрашивает YouTube Data API v3,
сохраняет цифры в `docs/data/state.json`, а GitHub Pages показывает сайт. Сайт можно поставить на телефон как приложение.

## Шаги (около 10 минут)

### 1. Ключ YouTube API (карта не нужна)
1. Открой https://console.cloud.google.com и войди в Google-аккаунт.
2. Сверху «Select a project» → «New project» → создать.
3. Меню → APIs & Services → Library → найди «YouTube Data API v3» → Enable.
4. APIs & Services → Credentials → Create credentials → API key. Скопируй ключ.
Если Google предложит «Free trial» с картой, закрой это окно. Для YouTube Data API платёжный аккаунт не нужен.

### 2. Репозиторий на GitHub
1. Зарегистрируйся на https://github.com (карта не нужна).
2. New repository → имя например `again4k` → **Public** → Create.
3. «uploading an existing file» → перетащи ВСЁ содержимое распакованной папки (включая папки `.github` и `docs`) → Commit changes.
   Если папка `.github` не перетащилась (она скрытая): Add file → Create new file → в имени набери `.github/workflows/poll.yml` и вставь туда текст из файла.

### 3. Положить ключ
Репозиторий → Settings → Secrets and variables → Actions → New repository secret:
имя `YOUTUBE_API_KEY`, значение: твой ключ.

### 4. Включить сайт
Settings → Pages → Source: «Deploy from a branch» → Branch: `main`, папка `/docs` → Save.

### 5. Первый запуск
Вкладка Actions → слева «poll» → Run workflow. Через минуту в репозитории появится `docs/data/state.json`.
Дальше всё идёт само, раз в ~10 минут.

### 6. Открыть
Адрес: `https://ТВОЙ_НИК.github.io/again4k/`
Телефон: открой в Chrome → меню → «Установить приложение» (iPhone: Safari → Поделиться → «На экран Домой»).

## Необязательно: уведомления в Telegram
Создай бота у @BotFather, добавь секреты `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`.
Придёт сообщение о новом видео, трансляции и круглых отметках.

## Честно о минусах
- GitHub запускает расписание «примерно»: интервал бывает 10–30 минут, иногда дольше в часы пик.
- Если в репозитории 60 дней нет изменений, GitHub отключает расписание. Здесь бот сам коммитит данные, так что обычно это не страшно; если вдруг остановится, нажми Run workflow.
- Репозиторий должен быть публичным (для бесплатных Pages). Ключ при этом в секретах и не виден. Данные канала и так публичные.
- Подписчиков YouTube отдаёт округлённо (до 3 значащих цифр), поэтому график подписчиков идёт ступеньками.
- История копится с первого запуска: прошлое API не отдаёт.
