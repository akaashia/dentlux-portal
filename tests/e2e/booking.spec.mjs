import { test, expect } from '@playwright/test';
import { localDate, addDays } from '../../backend/booking.mjs';
import { mkdirSync } from 'node:fs';

let bookingDate = addDays(localDate(), 1);
if (new Date(`${bookingDate}T12:00:00+05:00`).getUTCDay() === 0)
  bookingDate = addDays(bookingDate, 1);
test('patient books, receptionist sees it and can change and undo status', async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ваша улыбка. Наша забота.' })).toBeVisible();
  mkdirSync('.work/screenshots', { recursive: true });
  await page.screenshot({ path: '.work/screenshots/desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Записаться на приём', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Время позаботиться о себе' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await dialog.getByLabel('Другая дата').fill(bookingDate);
  await dialog.getByRole('button', { name: '10:00', exact: true }).click();
  await dialog.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await dialog.getByLabel('Номер телефона').fill('+77005555555');
  await dialog.getByRole('button', { name: 'Получить SMS-код' }).click();
  const code = await dialog.getByTestId('demo-code').textContent();
  await dialog.getByLabel('Код из SMS').fill(code);
  await dialog.getByRole('button', { name: 'Подтвердить номер' }).click();
  await expect(dialog.getByText('Номер подтверждён')).toBeVisible();
  await dialog.getByLabel('Ваше имя и фамилия').fill('Демо Тест Пациент');
  await dialog.getByRole('checkbox', { name: 'Я даю согласие', exact: false }).check();
  await dialog.getByRole('button', { name: 'Подтвердить запись', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Вы записаны!' })).toBeVisible();
  const reference = await dialog.locator('.reference strong').textContent();
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Добавить в календарь' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(`${reference}.ics`);
  await dialog.getByRole('button', { name: 'Отключить уведомления' }).click();
  await expect(
    dialog.getByText('Уведомления отключены. Сохраните приём в календаре.'),
  ).toBeVisible();
  await page.screenshot({ path: '.work/screenshots/confirmation.png' });
  await dialog.getByRole('button', { name: 'Отлично' }).click();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await page.getByRole('button', { name: 'Сотрудникам' }).click();
  await page.getByRole('button', { name: 'Регистратор' }).click();
  await page.getByRole('button', { name: 'Получить SMS-код' }).click();
  await page.getByLabel('Код из SMS').fill(await page.getByTestId('demo-code').textContent());
  await page.getByRole('button', { name: 'Подтвердить номер' }).click();
  await expect(page.getByRole('heading', { name: 'Обзор дня', exact: true })).toBeVisible();
  await page.locator('.date-toolbar input').fill(bookingDate);
  await expect(page.getByRole('cell', { name: 'Демо Тест Пациент', exact: false })).toBeVisible();
  const select = page.getByRole('combobox', { name: `Статус — ${reference}` });
  await select.selectOption('arrived');
  await expect(page.locator('.toast')).toContainText('Статус обновлён');
  await page.getByRole('button', { name: 'Отменить изменение' }).click();
  await expect(select).toHaveValue('scheduled');
  await page.getByRole('button', { name: 'Перенести', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '11:00', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Приём перенесён');
  await expect(page.getByRole('cell', { name: `11:00 ${reference}`, exact: true })).toBeVisible();
  await page.screenshot({ path: '.work/screenshots/workspace.png', fullPage: true });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Рабочее место' })).toBeVisible();
  expect(errors).toEqual([]);
  // A new session cannot read a staff endpoint, even if it opens the same URL.
  const anon = await browser.newContext();
  const response = await anon.request.get(
    'http://127.0.0.1:3101/api/staff/bookings?date=' + bookingDate,
  );
  expect(response.status()).toBe(401);
  await anon.close();
});
test('Kazakh localization, mobile layout, empty day and keyboard dialog close', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'ҚАЗ', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Сіздің күлкіңіз. Біздің қамқорлық.' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.work/screenshots/mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Қабылдауға жазылу', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Жалғастыру', exact: true }).click();
  let sunday = addDays(localDate(), 1);
  while (new Date(`${sunday}T12:00:00+05:00`).getUTCDay() !== 0) sunday = addDays(sunday, 1);
  await dialog.getByLabel('Басқа күн').fill(sunday);
  await expect(
    dialog.getByRole('heading', { name: 'Бұл күні бос уақыт жоқ. Басқа күнді таңдаңыз.' }),
  ).toBeVisible();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Қабылдауға жазылу', exact: true }).first(),
  ).toBeFocused();
  for (const width of [320, 360, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Horizontal overflow at ${width}px`,
    ).toBe(true);
  }
});
