import puppeteer from 'puppeteer';
import 'dotenv/config';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

// create common objects
const db = await open({ filename: 'totalplay-consumo.db', driver: sqlite3.Database });
const browser = await puppeteer.launch();
const page = await browser.newPage();

/* TotalPlay AJAX reply to 'consulta-consumo'.
 * NOTE ALL INTEGERS ARE SENT AS STRINGS (i.e., "1701" instead of 1701)
{
  "result": "0",                     // "0" if successful
  "descripcion": "Peticion Exitosa", // message
  "bean": {
    "velocidad": "800",         // velocity in Mbps
    "contratados": "3500",      // data cap in GB
    "consumo": "1701",          // amount of data consumed
    "disponible": "1799",       // amount of data remaining
    "porcentaje": "49",         // percentage of data consumed
    "fechaCorte": "02/05/2025", // date in DD/MM/YYYY format
    "notificacion": "0",        // "0" if not notified about data consumed
    "excedente": "0",           // "0" if not over data cap
    "consumo4TB": false,        // whether over 4 TB
    "consumo1TB": true,         // whether over 1 TB
    "whiteListConsumoTP": false // unknown
  }
}
*/

// observe AJAX request with consumption data and harvest it
page.on('response', async (response) => {
    const request = response.request();
    if (request.url().endsWith('PROD/micuenta/consulta-consumo') && request.method() === 'POST') {
        const data = JSON.parse(await response.text());
        if (data.result === '0') {
            const metadata = await db.get('SELECT * FROM metadata WHERE id = ?', 1);
            if (!metadata) {
                await db.run('INSERT INTO metadata(capacity, velocity) VALUES(?, ?)', [data.bean.contratados, data.bean.velocidad]);
            }
            const day = data.bean.fechaCorte.slice(0,2),
                month = data.bean.fechaCorte.slice(3,5),
                year = data.bean.fechaCorte.slice(6,10);
            await db.run('INSERT INTO consumption(consumption, cutoff) VALUES(?, ?)', [data.bean.consumo, year + '-' + month + '-' + day]);
        }
    }
});

try {
    // sign in
    await page.setViewport({height: 1080, width: 1920});
    await page.goto('https://www.mitotalplay.com.mx/');
    await page.type('#log-user', process.env.TOTALPLAY_USERNAME);
    await page.type('#log-pass', process.env.TOTALPLAY_PASSWORD);
    await page.click('#log-but-inises');
    await page.waitForNavigation();

    // load "Paquetes" page and log out
    await page.goto('https://www.mitotalplay.com.mx/Paquetes', { waitUntil: 'networkidle0' });
    await page.click('#userName');
    await page.click('#logout');
    await page.waitForNavigation();
} catch(error) {
    console.log(error);
} finally {
    await browser.close();
    await db.close();
}