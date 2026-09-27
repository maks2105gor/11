# Перенос на VPS: главное меню + Amazing Table

Как устроено:

| Адрес | Что там | Откуда файлы |
|---|---|---|
| https://amazin-table.myosincos.info/ | главное меню «Во что сыграем?» | `portal/` |
| https://amazin-table.myosincos.info/amazing-table/ | Amazing Table | корень репозитория |
| https://play.myosincos.info/ | Карточный стол | как сейчас, не меняется |

Карточный стол остаётся на своём домене со своим конфигом nginx. Меню просто ведёт на
него плиткой, а на Карточном столе можно добавить ссылку обратно в меню (шаг 5).

На сервере новые файлы лежат в `/var/www/games/`:

```
/var/www/games/
├── portal/          главное меню
└── amazing-table/   Amazing Table
```

## 0. DNS

У регистратора домена `myosincos.info` добавьте A-запись: имя `amazin-table`, значение —
IP вашего VPS (тот же, что у `play`). Проверка: `ping amazin-table.myosincos.info` должен
показать этот IP (обновление DNS занимает от нескольких минут до часа).

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

Конфиг отдельный, на старый конфиг `play.myosincos.info` он не влияет — тот не трогайте.

```bash
sudo cp deploy/nginx-games.conf /etc/nginx/sites-available/amazin-table.conf
sudo ln -s /etc/nginx/sites-available/amazin-table.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Проверка без HTTPS: http://amazin-table.myosincos.info/ — должно появиться меню.

## 4. HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx   # если ещё не стоит
sudo certbot --nginx -d amazin-table.myosincos.info
```

Готово: https://amazin-table.myosincos.info/ — меню с двумя играми. После HTTPS у Amazing
Table включается офлайн-режим и установка на экран телефона.

## 5. Ссылка «Все игры» в Карточном столе

В Amazing Table кнопка «← Все игры» уже есть. В Карточный стол добавьте ссылку в любое
место меню, например под заголовок «Карточный стол»:

```html
<a href="https://amazin-table.myosincos.info/"
   style="display:inline-block;margin-top:8px;color:#e6c27a;text-decoration:none;
          font:600 14px/1 system-ui,sans-serif;letter-spacing:.08em">← ВСЕ ИГРЫ</a>
```

## Добавить новую игру в меню

В `portal/index.html` скопируйте один блок `<li>…</li>`, поменяйте адрес (путь на этом
сайте или полный адрес другого домена), название и иконку (`portal/icons/`, квадрат
512×512), затем `sudo ./deploy/deploy.sh`.

## Цвета

| Токен | Цвет | Где |
|---|---|---|
| фон меню | `#1d1a22` сливовый графит | новый, между бордовым и кремовым |
| золото | `#e6c27a` | заголовки Карточного стола, заголовок меню |
| кремовый | `#f3ead3` | бумага Amazing Table, текст меню |
| бордовый | `#3b1022` | иконка Карточного стола |
