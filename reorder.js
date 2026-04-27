const fs = require('fs');

const raw = fs.readFileSync('firestore.indexes.json', 'utf8');
const parsed = JSON.parse(raw);

const sharedCols = ['users', 'notifications', 'tasks', 'roles', 'master_lists', 'integrations', 'audit_logs', 'holiday_calendar'];
const bpmnCols = ['request_templates', 'requests', 'documents', 'comments'];

const categorize = (item) => {
  if (sharedCols.includes(item.collectionGroup)) return 'SHARED';
  if (bpmnCols.includes(item.collectionGroup)) return 'BPMN';
  return 'HCM';
};

const processItems = (items, isFieldOverrides = false) => {
  if (!items || items.length === 0) return '';
  
  // Tag items and sort them
  const taggedItems = items.map(item => ({ ...item, __mod: categorize(item) }));
  
  // Sort by module (SHARED, BPMN, HCM), then by collectionGroup
  const modOrder = { 'SHARED': 1, 'BPMN': 2, 'HCM': 3 };
  taggedItems.sort((a, b) => {
    if (modOrder[a.__mod] !== modOrder[b.__mod]) {
      return modOrder[a.__mod] - modOrder[b.__mod];
    }
    return a.collectionGroup.localeCompare(b.collectionGroup);
  });

  let output = '';
  let currentMod = '';
  let currentGroup = '';

  taggedItems.forEach((idx, i) => {
    const isFirst = (i === 0);
    
    if (!isFirst) {
      output += ',\n';
    }

    if (currentMod !== idx.__mod) {
      output += `\n    // -------------------------------------------------------\n`;
      output += `    // ${isFieldOverrides ? 'FIELD OVERRIDES — ' : 'MÓDULO: '}${idx.__mod}\n`;
      output += `    // -------------------------------------------------------\n`;
      currentMod = idx.__mod;
    }
    
    if (!isFieldOverrides && currentGroup !== idx.collectionGroup) {
      output += `    // --- ${idx.collectionGroup} ---\n`;
      currentGroup = idx.collectionGroup;
    }

    // clone and remove __mod
    const cleanIdx = { ...idx };
    delete cleanIdx.__mod;
    
    let formatted = JSON.stringify(cleanIdx, null, 2).replace(/^/gm, '    ');
    output += formatted;
  });
  
  return output + '\n';
};

let newJsonString = `{\n  "indexes": [\n`;
newJsonString += processItems(parsed.indexes, false);
newJsonString += `  ]`;

if (parsed.fieldOverrides && parsed.fieldOverrides.length > 0) {
  newJsonString += `,\n  "fieldOverrides": [\n`;
  newJsonString += processItems(parsed.fieldOverrides, true);
  newJsonString += `  ]\n`;
} else {
  newJsonString += `\n`;
}

newJsonString += `}\n`;

fs.writeFileSync('firestore.indexes.json', newJsonString, 'utf8');
console.log('Done!');
