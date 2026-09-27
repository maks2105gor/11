# Перенос на VPS

| Адрес | Что там | Файлы в репозитории |
|---|---|---|
| https://games.myosincos.info/ | главное меню «Во что сыграем?» | `portal/` |
| https://amazin-table.myosincos.info/ | Amazing Table | `index.html`, `css/`, `js/`, … |
| https://play.myosincos.info/ | Карточный стол (с кнопкой «← все игры») | `cards/index.html` |

Все команды ниже выполняются **на VPS**: подключитесь к нему по SSH (`ssh root@IP-сервера`
с компьютера или через приложение Termius на телефоне).

## Шаг 1. DNS (один раз)

У регистратора домена `myosincos.info` добавьте две A-записи со значением — IP вашего VPS
(тот же, что у `play`):

| Имя | Тип | Значение |
|---|---|---|
| `games` | A | IP сервера |
| `amazin-table` | A | IP сервера |

Проверка: `ping games.myosincos.info` показывает IP сервера (DNS обновляется до часа).

## Шаг 2. Скачать файлы на сервер

Репозиторий публичный, сервер скачает всё сам:

```bash
cd /opt
sudo rm -rf games
curl -L https://github.com/maks2105gor/11/archive/refs/heads/claude/hello-rruojc.tar.gz | sudo tar -xz
sudo mv 11-claude-hello-rruojc games
cd games
```

(Когда PR будет влит в `main`, в адресе замените `refs/heads/claude/hello-rruojc` на
`refs/heads/main`, а папку — на `11-main`.)

## Шаг 3. Узнать папку Карточного стола

```bash
sudo grep -rA15 "play.myosincos.info" /etc/nginx/sites-enabled/ | grep -m1 -w root
```

Покажет строку вида `root /var/www/play;` — это и есть папка. Если вместо `root` там
`proxy_pass` (игра запущена как приложение), найдите, откуда приложение отдаёт
`index.html`, и используйте ту папку.

## Шаг 4. Выложить всё

Подставьте папку из шага 3:

```bash
sudo PLAY_ROOT=/var/www/play ./deploy/deploy.sh
```

Скрипт:
- кладёт меню в `/var/www/games/portal` и Amazing Table в `/var/www/games/amazing-table`;
- заменяет `index.html` Карточного стола новой версией с кнопкой «← все игры», а старый
  сохраняет рядом как `index.html.bak-ДАТА`;
- проверяет конфиг и перезагружает nginx.

Без `PLAY_ROOT=…` Карточный стол не трогается.

## Шаг 5. Включить сайты в nginx (один раз)

```bash
sudo cp deploy/nginx-games.conf /etc/nginx/sites-available/games.conf
sudo ln -s /etc/nginx/sites-available/games.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Конфиг `play.myosincos.info` не трогайте — он остаётся как есть.

## Шаг 6. HTTPS (один раз)

```bash
sudo apt install -y certbot python3-certbot-nginx   # если ещё не стоит
sudo certbot --nginx -d games.myosincos.info -d amazin-table.myosincos.info
```

Готово: откройте https://games.myosincos.info/.

## Как обновлять потом

Повторите шаги 2 и 4 — DNS, nginx и HTTPS второй раз настраивать не нужно.

## Откатить Карточный стол

```bash
ls /var/www/play/index.html.bak-*                       # список копий
sudo cp /var/www/play/index.html.bak-ДАТА /var/www/play/index.html
```

## Другое имя для меню

Хотите вместо `games` другое (например, `menu`)? Поменяйте `games.myosincos.info` в
`deploy/nginx-games.conf` (server_name), в `index.html` (строка `portal-url`) и в
`cards/index.html` (ссылка «← все игры»).

## Добавить новую игру в меню

В `portal/index.html` скопируйте блок `<li>…</li>`, поменяйте адрес, название и иконку
(`portal/icons/`, квадрат 512×512), затем шаг 4.

## Цвета

| Токен | Цвет | Где |
|---|---|---|
| фон меню | `#1d1a22` сливовый графит | новый, между бордовым и кремовым |
| золото | `#f0d48a` | то же, что в Карточном столе (`--gold-bright`) |
| кремовый | `#f3ead3` | бумага Amazing Table, текст меню |
| бордовый | `#3b1022` | иконка Карточного стола |
