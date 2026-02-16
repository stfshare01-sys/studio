
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// Embedded SEED_EMPLOYEES to avoid import issues
const SEED_EMPLOYEES = [
    { id: 'emp-director' },
    { id: 'emp-gerente-rh' },
    { id: 'emp-coord-rh' },
    { id: 'emp-coord-ops' },
    { id: 'emp-analista-rh-1' },
    { id: 'emp-analista-rh-2' },
    { id: 'emp-analista-rh-3' },
    { id: 'emp-ops-1' },
    { id: 'emp-ops-2' },
    { id: 'emp-ops-3' },
];

const EXAMPLE_DIR = 'C:/Users/francisco.rivera/OneDrive - Stuffactory, S.A. de C.V/Escritorio/ejemplo';

function validateFiles() {
    if (!fs.existsSync(EXAMPLE_DIR)) {
        console.error(`Directory not found: ${EXAMPLE_DIR}`);
        return;
    }

    const files = fs.readdirSync(EXAMPLE_DIR).filter(f => f.endsWith('.xlsx'));

    console.log(`Found ${files.length} Excel files in ${EXAMPLE_DIR}\n`);

    const validIds = new Set(SEED_EMPLOYEES.map(e => e.id));

    files.forEach(file => {
        console.log(`Processing: ${file}`);
        const fullPath = path.join(EXAMPLE_DIR, file);
        try {
            const workbook = XLSX.readFile(fullPath);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];

            // Read as JSON array of arrays
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            if (!rows || rows.length < 2) {
                console.log('  ⚠️ File is empty or has no data rows');
                return;
            }

            console.log(`  Header: ${JSON.stringify(rows[0])}`);

            // Check first 5 rows
            let mismatchCount = 0;
            let matchCount = 0;
            const sampleMismatches = [];

            // Skip header
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row) continue;
                const empId = row[0] ? String(row[0]).trim() : '';

                if (!empId) continue;

                if (validIds.has(empId)) {
                    matchCount++;
                } else {
                    mismatchCount++;
                    if (sampleMismatches.length < 3) {
                        sampleMismatches.push(empId);
                    }
                }
            }

            console.log(`  ✅ Matches: ${matchCount}`);
            if (mismatchCount > 0) {
                console.log(`  ❌ Mismatches: ${mismatchCount}`);
                console.log(`  ⚠️ Sample invalid IDs: ${sampleMismatches.join(', ')}`);
            } else {
                console.log(`  ✨ All IDs are valid seeded employees!`);
            }
        } catch (err) {
            console.error(`  ❌ Error reading file: ${err.message}`);
        }
        console.log('');
    });
}

validateFiles();
