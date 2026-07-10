import fs from 'fs';
import path from 'path';

const backupPath = path.join(process.cwd(), 'scratch', 'backup_1783534635134.json');
if (fs.existsSync(backupPath)) {
  const content = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  console.log("Tables in Backup:", Object.keys(content));
  if (content.products) {
    console.log("Total Products in Backup JSON:", content.products.length);
    console.log("SKUs in Backup:", content.products.map((p: any) => p.sku));
  } else {
    console.log("No products key found in backup");
  }
} else {
  console.log("Backup file not found");
}
