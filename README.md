# Invictus Script Runner

Отдельное мини-приложение для менеджеров Invictus Girls.
Скрипт исходящего звонка по заявке — без CRM, без логина.

## Запуск локально

```bash
npm install
npm run dev
```

Открой http://localhost:5173

## Деплой на Vercel

1. Залей папку на GitHub (новый репозиторий)
2. Зайди на vercel.com → New Project → выбери репозиторий
3. Framework Preset: **Vite** (определится автоматически)
4. Deploy

После деплоя получишь ссылку вида `invictus-script.vercel.app`

## Подключение домена script.invictus.kz

1. В Vercel: Settings → Domains → Add Domain → введи `script.invictus.kz`
2. Vercel покажет DNS-запись (обычно CNAME)
3. У регистратора домена добавь эту запись
4. Через 5-10 минут ссылка заработает

## Обновление скрипта

Данные скрипта находятся в `src/data/`:
- `script-part1.ts` — первая половина дерева
- `script-part2.ts` — вторая половина (возражения, закрытие)
- `branches.ts` — 6 филиалов с программами
- `script-defaults.ts` — цены абонементов

После изменений — `git push`, Vercel автоматически пересоберёт.
