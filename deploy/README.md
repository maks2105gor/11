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
sudo grep -RA15 "server_name play.myosincos.info" /etc/nginx/ | grep -m1 -w root
```

Покажет строку вида `root /var/www/play;` — это и есть папка (на вашем сервере это
`/var/www/play`). Если команда ничего не вывела, найдите сам файл игры:
`sudo grep -rl "Пятая карта" /var /srv /home /opt --include='*.html' | grep -v /opt/games`. Если вместо `root` там
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

> Только при первой установке. После шага 6 certbot дописывает HTTPS прямо в
> `/etc/nginx/sites-available/games.conf`, и повторное копирование его затрёт.

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

Только шаги 2 и 4 — DNS, nginx и HTTPS второй раз настраивать не нужно (а шаг 5 и вредно:
он сотрёт настройки HTTPS):

```bash
cd /opt && sudo rm -rf games
curl -L https://github.com/maks2105gor/11/archive/refs/heads/claude/hello-rruojc.tar.gz | sudo tar -xz
sudo mv 11-claude-hello-rruojc games && cd games
sudo PLAY_ROOT=/var/www/play ./deploy/deploy.sh
```

## Сертификаты HTTPS

Let's Encrypt выдаёт сертификаты на 90 дней; certbot продлевает их сам, когда остаётся
меньше 30 дней. Настроить один раз (шаги 2–4), дальше только поглядывать на шаг 1.

```bash
# 1. Все сертификаты и сроки (play.myosincos.info и games.myosincos.info + amazin-table)
sudo certbot certificates

# 2. Автопродление включено? Должна быть строка certbot.timer
systemctl list-timers | grep -i certbot
sudo systemctl enable --now certbot.timer          # если строки нет
# нет ни certbot.timer, ни snap.certbot.renew.timer — запасной вариант через cron:
echo '17 3,15 * * * root certbot renew --quiet' | sudo tee /etc/cron.d/certbot-renew

# 3. Пробное продление (ничего не меняет)
sudo certbot renew --dry-run

# 4. Перезагружать nginx после каждого продления
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nsystemctl reload nginx\n' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

# 5. Продлить вручную (пропустит те, где осталось больше 30 дней)
sudo certbot renew
sudo certbot renew --force-renewal                 # только при проблемах: лимит ~5 в неделю

# 6. Какой сертификат видят посетители
for d in games.myosincos.info amazin-table.myosincos.info play.myosincos.info; do
  printf "%-30s " $d
  echo | openssl s_client -connect $d:443 -servername $d 2>/dev/null | openssl x509 -noout -enddate
done
```

Если продление не проходит: лог — `sudo tail -50 /var/log/letsencrypt/letsencrypt.log`;
сайт должен открываться по `http://` на порту 80, а DNS — указывать на этот сервер.

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
