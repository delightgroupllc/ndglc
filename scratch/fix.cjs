const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            if (file.endsWith('.astro')) results.push(file);
        }
    });
    return results;
}

const files = walk(path.join(process.cwd(), 'src'));
files.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    if (content.includes("'lucide-astro'") || content.includes('"lucide-astro"')) {
        content = content.replace(/['"]lucide-astro['"]/g, "'@lucide/astro'");
        fs.writeFileSync(f, content, 'utf8');
        console.log('Fixed', f);
    }
});
