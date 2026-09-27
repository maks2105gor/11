# Перенос на VPS: главное меню + Amazing Table

У каждой части свой поддомен:

| Адрес | Что там | Откуда файлы |
|---|---|---|
| https://games.myosincos.info/ | главное меню «Во что сыграем?» | `portal/` |
| https://amazin-table.myosincos.info/ | Amazing Table | корень репозитория |
| https://play.myosincos.info/ | Карточный стол | как сейчас, не меняется |

Карточный стол остаётся со своим конфигом nginx. Меню ведёт на обе игры, из Amazing Table
есть кнопка «← Все игры», в Карточный стол такую ссылку можно добавить (шаг 5).

На сервере новые файлы лежат в `/var/www/games/`:

```
/var/www/games/
├── portal/          главное меню        → games.myosincos.info
└── amazing-table/   Amazing Table       → amazin-table.myosincos.info
```

> Хотите другое имя для меню (например, `menu` или `hub`)? Поменяйте `games.myosincos.info`
> в трёх местах: `server_name` в `deploy/nginx-games.conf`, строка `portal-url` в
> `index.html` и ссылка в шаге 5 ниже.

## 0. DNS

У регистратора домена `myosincos.info` добавьте две A-записи со значением — IP вашего VPS
(тот же, что у `play`):

| Имя | Тип | Значение |
|---|---|---|
| `games` | A | IP сервера |
| `amazin-table` | A | IP сервера |

Проверка: `ping games.myosincos.info` и `ping amazin-table.myosincos.info` показывают этот IP
(обновление DNS занимает от нескольких минут до часа).

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

## 3. Включить конфиг nginx

Конфиг отдельный, на конфиг `play.myosincos.info` он не влияет — тот не трогайте.

```bash
sudo cp deploy/nginx-games.conf /etc/nginx/sites-available/games.conf
sudo ln -s /etc/nginx/sites-available/games.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Проверка без HTTPS: http://games.myosincos.info/ — меню, http://amazin-table.myosincos.info/ — игра.

## 4. HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx   # если ещё не стоит
sudo certbot --nginx -d games.myosincos.info -d amazin-table.myosincos.info
```

Готово: https://games.myosincos.info/ — меню с двумя играми. После HTTPS у Amazing Table
включается офлайн-режим и установка на экран телефона.

## 5. Ссылка «Все игры» в Карточном столе

В Amazing Table кнопка «← Все игры» уже есть. В Карточный стол добавьте ссылку в любое
место меню, например под заголовок «Карточный стол»:

```html
<a href="https://games.myosincos.info/"
   style="display:inline-block;margin-top:8px;color:#e6c27a;text-decoration:none;
          font:600 14px/1 system-ui,sans-serif;letter-spacing:.08em">← ВСЕ ИГРЫ</a>
```

## Добавить новую игру в меню

В `portal/index.html` скопируйте один блок `<li>…</li>`, поменяйте адрес игры, название и
иконку (`portal/icons/`, квадрат 512×512), затем `sudo ./deploy/deploy.sh`.

## Цвета

| Токен | Цвет | Где |
|---|---|---|
| фон меню | `#1d1a22` сливовый графит | новый, между бордовым и кремовым |
| золото | `#e6c27a` | заголовки Карточного стола, заголовок меню |
| кремовый | `#f3ead3` | бумага Amazing Table, текст меню |
| бордовый | `#3b1022` | иконка Карточного стола |
