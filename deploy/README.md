# Перенос на VPS: главное меню + игры

Домен: **amazin-table.myosincos.info**. После переноса сайт устроен так:

| Адрес | Что там | Откуда файлы |
|---|---|---|
| https://amazin-table.myosincos.info/ | главное меню «Во что сыграем?» | `portal/` |
| https://amazin-table.myosincos.info/amazing-table/ | Amazing Table | корень репозитория |
| https://amazin-table.myosincos.info/cards/ | Карточный стол | ваша текущая игра |

## 0. DNS

У регистратора домена `myosincos.info` добавьте A-запись: имя `amazin-table`, значение —
IP вашего VPS. Проверка: `ping amazin-table.myosincos.info` должен показать этот IP
(обновление DNS занимает от нескольких минут до часа).

На сервере всё лежит в `/var/www/games/`:

```
/var/www/games/
├── portal/          главное меню (кладёт deploy.sh)
├── amazing-table/   Amazing Table (кладёт deploy.sh)
└── cards/           Карточный стол (если это статические файлы — копируете сами)
```

## 1. Забрать код на сервер

```bash
sudo apt install -y git nginx          # если чего-то нет
cd /opt
sudo git clone https://github.com/maks2105gor/11.git games
cd games
sudo git checkout claude/hello-rruojc   # или main, когда PR будет влит
```

## 2. Выложить меню и Amazing Table

```bash
sudo ./deploy/deploy.sh
```

Скрипт копирует файлы в `/var/www/games/portal` и `/var/www/games/amazing-table`
и перезагружает nginx. Обновление в будущем — те же две команды:

```bash
cd /opt/games && sudo git pull && sudo ./deploy/deploy.sh
```

## 3. Подключить Карточный стол

Посмотрите, как игра запущена сейчас (`ls /etc/nginx/sites-enabled/` и файл внутри).

**Если это папка с `index.html`** (в конфиге есть `root /какой-то/путь;`):

```bash
sudo cp -R /какой-то/путь /var/www/games/cards
```

В `deploy/nginx-games.conf` оставьте вариант А.

**Если это приложение на порту** (в конфиге есть `proxy_pass http://127.0.0.1:ПОРТ;`):
в `deploy/nginx-games.conf` закомментируйте вариант А, раскомментируйте вариант Б и
поставьте свой порт.

> Игра переезжает с `/` на `/cards/`. Если в её HTML пути к файлам абсолютные
> (`src="/app.js"`, `href="/style.css"`), уберите начальный слэш (`src="app.js"`),
> иначе браузер будет искать их в корне сайта. Для приложения на порту то же касается
> адресов API в JS (`fetch('/api/...')` → `fetch('api/...')`).

## 4. Включить конфиг nginx

```bash
# server_name уже стоит amazin-table.myosincos.info; поменяйте, если домен другой
sudo cp deploy/nginx-games.conf /etc/nginx/sites-available/games.conf
sudo ln -s /etc/nginx/sites-available/games.conf /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/<старый конфиг карточной игры>   # чтобы не было двух server на один домен
sudo nginx -t && sudo systemctl reload nginx
```

HTTPS (после того как DNS из шага 0 заработал):

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d amazin-table.myosincos.info
```

Проверка: откройте https://amazin-table.myosincos.info/ — должно появиться меню с двумя играми.

## 5. Кнопка «Все игры» в Карточном столе

В Amazing Table кнопка уже есть (строка `<meta name="portal-url" content="/">` в
`index.html`). В Карточный стол добавьте ссылку в любое место меню, например под
заголовок «Карточный стол»:

```html
<a href="/" style="display:inline-block;margin-top:8px;color:#e6c27a;text-decoration:none;
   font:600 14px/1 system-ui,sans-serif;letter-spacing:.08em">← ВСЕ ИГРЫ</a>
```

## Добавить новую игру в меню

В `portal/index.html` скопируйте один блок `<li>…</li>`, поменяйте адрес, название и
иконку (`portal/icons/`, квадрат 512×512), затем `sudo ./deploy/deploy.sh`.

## Цвета

| Токен | Цвет | Где |
|---|---|---|
| фон меню | `#1d1a22` сливовый графит | новый, между бордовым и кремовым |
| золото | `#e6c27a` | заголовки Карточного стола, заголовок меню |
| кремовый | `#f3ead3` | бумага Amazing Table, текст меню |
| бордовый | `#3b1022` | иконка Карточного стола |
