// v3.5.0 — 2026-03-22

// ─── app-a-family-hub/js/relation-engine.js ─────────────────────────────────
// Family relation engine
// Handles: bidirectional auto-reverse, tree traversal, emergency contact wiring
// All functions are pure -- they take data in, return new data out

'use strict';

// ── Relation definitions ──────────────────────────────────────────────────────
// Maps a relation to its auto-generated reverse, keyed by gender heuristic
export const RELATIONS = [
  'Husband', 'Wife', 'Partner',
  'Father', 'Mother',
  'Son', 'Daughter',
  'Brother', 'Sister',
  'Grandfather', 'Grandmother',
  'Grandson', 'Granddaughter',
  'Uncle', 'Aunt',
  'Nephew', 'Niece',
  'Guardian', 'Ward',
  'Other'
];

// Auto-reverse map: given "from is X of to", what is "to of from"?
const REVERSE_MAP = {
  'Husband':      'Wife',
  'Wife':         'Husband',
  'Partner':      'Partner',
  'Father':       'Child',      // resolved to Son/Daughter via gender later
  'Mother':       'Child',
  'Son':          'Parent',     // resolved to Father/Mother later
  'Daughter':     'Parent',
  'Brother':      'Sibling',    // resolved to Brother/Sister later
  'Sister':       'Sibling',
  'Grandfather':  'Grandchild',
  'Grandmother':  'Grandchild',
  'Grandson':     'Grandparent',
  'Granddaughter':'Grandparent',
  'Uncle':        'Nephew/Niece',
  'Aunt':         'Nephew/Niece',
  'Nephew':       'Uncle/Aunt',
  'Niece':        'Uncle/Aunt',
  'Guardian':     'Ward',
  'Ward':         'Guardian',
  'Other':        'Other',
};

// Resolve placeholder reverse labels into real relation names
export function resolveReverse(relation, _toMemberName = '') {
  const base = REVERSE_MAP[relation] || 'Other';
  // These need context (gender) to resolve fully -- we use the clean labels
  const map = {
    'Child':        'Child',       // app shows as "Child of [name]"
    'Parent':       'Parent',
    'Sibling':      'Sibling',
    'Grandchild':   'Grandchild',
    'Grandparent':  'Grandparent',
    'Nephew/Niece': 'Nephew/Niece',
    'Uncle/Aunt':   'Uncle/Aunt',
  };
  return map[base] || base;
}

// ── Core: add a relation (bidirectional) ─────────────────────────────────────
export function addRelation(relations = [], fromId, relation, toId) {
  const existing = relations.find(r =>
    r.fromId === fromId && r.toId === toId
  );
  if (existing) {
    // Update in place
    existing.relation = relation;
  } else {
    relations.push({ id: _uuid(), fromId, relation, toId });
  }

  // Auto-create reverse
  const reverseLabel = resolveReverse(relation);
  const existingReverse = relations.find(r =>
    r.fromId === toId && r.toId === fromId
  );
  if (existingReverse) {
    existingReverse.relation = reverseLabel;
  } else {
    relations.push({ id: _uuid(), fromId: toId, relation: reverseLabel, toId: fromId });
  }

  return [...relations];
}

// ── Remove a relation (bidirectional) ────────────────────────────────────────
export function removeRelation(relations = [], fromId, toId) {
  return relations.filter(r =>
    !(r.fromId === fromId && r.toId === toId) &&
    !(r.fromId === toId   && r.toId === fromId)
  );
}

// ── Get all relations for one member ─────────────────────────────────────────
export function getMemberRelations(relations = [], memberId) {
  return relations.filter(r => r.fromId === memberId);
}

// ── Get immediate family (spouse + children + parents) ───────────────────────
export function getImmediateFamily(relations = [], memberId) {
  const mine = getMemberRelations(relations, memberId);
  return mine.filter(r =>
    ['Husband','Wife','Partner','Father','Mother','Son','Daughter','Child','Parent'].includes(r.relation)
  );
}

// ── Get relation label from A to B ───────────────────────────────────────────
export function getRelationLabel(relations = [], fromId, toId) {
  const r = relations.find(r => r.fromId === fromId && r.toId === toId);
  return r?.relation || null;
}

// ── Build grouped family units for dashboard ─────────────────────────────────
// Returns array of groups: [{ type, members: [member] }]
export function buildFamilyGroups(members, relations = []) {
  const assigned = new Set();
  const groups   = [];

  // 1. Find couples (Husband/Wife/Partner pairs)
  const coupleRelations = relations.filter(r =>
    ['Husband','Wife','Partner'].includes(r.relation)
  );
  const seenPairs = new Set();

  coupleRelations.forEach(r => {
    const pairKey = [r.fromId, r.toId].sort().join('|');
    if (seenPairs.has(pairKey)) return;
    seenPairs.add(pairKey);

    const memberA = members.find(m => m.id === r.fromId);
    const memberB = members.find(m => m.id === r.toId);
    if (!memberA || !memberB) return;

    // Find their children
    const childRelations = relations.filter(rel =>
      (rel.fromId === r.fromId || rel.fromId === r.toId) &&
      ['Son','Daughter','Child'].includes(rel.relation)
    );
    const childIds = [...new Set(childRelations.map(cr => cr.toId))];
    const children = childIds.map(id => members.find(m => m.id === id)).filter(Boolean);

    const groupMembers = [memberA, memberB, ...children];
    groupMembers.forEach(m => assigned.add(m.id));

    groups.push({
      type: children.length > 0 ? 'family-unit' : 'couple',
      label: `${memberA.name} & ${memberB.name}`,
      members: groupMembers,
    });
  });

  // 2. Remaining members -- solo or sibling groups
  const unassigned = members.filter(m => !assigned.has(m.id));
  const siblingGroups = buildSiblingGroups(unassigned, relations, assigned);
  groups.push(...siblingGroups);

  // 3. Truly solo members
  const stillUnassigned = members.filter(m => !assigned.has(m.id));
  stillUnassigned.forEach(m => {
    assigned.add(m.id);
    groups.push({ type: 'solo', label: m.name, members: [m] });
  });

  return groups;
}

function buildSiblingGroups(candidates, relations, assignedSet) {
  const groups = [];
  const seen   = new Set();

  candidates.forEach(m => {
    if (seen.has(m.id)) return;
    const siblingRelations = relations.filter(r =>
      r.fromId === m.id && ['Brother','Sister','Sibling'].includes(r.relation)
    );
    const siblingIds = siblingRelations.map(r => r.toId);
    const siblings   = candidates.filter(c => siblingIds.includes(c.id) && !seen.has(c.id));

    if (siblings.length > 0) {
      const groupMembers = [m, ...siblings];
      groupMembers.forEach(s => { seen.add(s.id); assignedSet.add(s.id); });
      groups.push({ type: 'siblings', label: 'Siblings', members: groupMembers });
    }
  });

  return groups;
}

// ── Build emergency contacts from family relations ─────────────────────────────
// Returns array of emergency contact objects derived from member profiles
export function buildRelationEmergencyContacts(memberId, members, relations) {
  const myRelations = getMemberRelations(relations, memberId);
  const contacts    = [];

  myRelations.forEach((rel, idx) => {
    const relatedMember = members.find(m => m.id === rel.toId);
    if (!relatedMember) return;
    if (!relatedMember.phone) return; // no phone = can't be emergency contact

    contacts.push({
      id:           `relation-${rel.toId}`,
      name:         relatedMember.name,
      phone:        relatedMember.phone,
      relationship: rel.relation,
      description:  `${rel.relation} -- linked profile`,
      priority:     _relationPriority(rel.relation) + idx,
      fromRelation: true,   // flag: sourced from relation tree, not manually entered
      memberId:     rel.toId,
    });
  });

  return contacts.sort((a, b) => a.priority - b.priority);
}

// Priority order for auto-emergency contacts
function _relationPriority(relation) {
  const order = {
    'Husband': 1, 'Wife': 1, 'Partner': 1,
    'Father': 2, 'Mother': 2, 'Parent': 2,
    'Son': 3, 'Daughter': 3, 'Child': 3,
    'Brother': 4, 'Sister': 4, 'Sibling': 4,
    'Guardian': 2, 'Ward': 5,
  };
  return order[relation] || 6;
}

// ── SVG tree layout ───────────────────────────────────────────────────────────
// Returns { nodes: [{id, x, y, member}], edges: [{x1,y1,x2,y2,label}] }
export function layoutFamilyTree(members, relations) {
  if (!members.length) return { nodes: [], edges: [] };

  const NODE_W = 90, NODE_H = 52, H_GAP = 24, V_GAP = 70;

  // Build generations using BFS from root
  // Head of household takes priority as root; fallback to first couple or first member
  const headOfHousehold = members.find(m => m.headOfHousehold);
  const coupleRelation  = relations.find(r => ['Husband','Wife','Partner'].includes(r.relation));
  const rootId = headOfHousehold?.id || coupleRelation?.fromId || members[0]?.id;

  // Assign generations
  const genMap = new Map(); // id → generation (0 = root)
  const parentMap = new Map(); // id → [parentIds]
  const visited = new Set();
  const queue = [{ id: rootId, gen: 0 }];

  while (queue.length) {
    const { id, gen } = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    genMap.set(id, gen);

    const myRels = relations.filter(r => r.fromId === id);
    myRels.forEach(r => {
      if (!visited.has(r.toId)) {
        const nextGen = ['Son','Daughter','Child'].includes(r.relation) ? gen + 1
          : ['Father','Mother','Parent'].includes(r.relation) ? gen - 1
          : gen; // Spouse/Sibling = same gen
        queue.push({ id: r.toId, gen: nextGen });
        if (['Son','Daughter','Child'].includes(r.relation)) {
          if (!parentMap.has(r.toId)) parentMap.set(r.toId, []);
          parentMap.get(r.toId).push(id);
        }
      }
    });
  }

  // Any unvisited members → assign gen 0
  members.forEach(m => { if (!genMap.has(m.id)) genMap.set(m.id, 0); });

  // Group by generation
  const genGroups = new Map();
  genMap.forEach((gen, id) => {
    if (!genGroups.has(gen)) genGroups.set(gen, []);
    genGroups.get(gen).push(id);
  });

  const sortedGens = [...genGroups.keys()].sort((a, b) => a - b);
  const maxWidth   = Math.max(...[...genGroups.values()].map(g => g.length));
  const totalW     = maxWidth * (NODE_W + H_GAP) - H_GAP;

  // Position nodes
  const nodes = [];
  sortedGens.forEach((gen, genIdx) => {
    const ids    = genGroups.get(gen);
    const rowW   = ids.length * (NODE_W + H_GAP) - H_GAP;
    const startX = (totalW - rowW) / 2;
    const y      = genIdx * (NODE_H + V_GAP) + 20;

    ids.forEach((id, i) => {
      const member = members.find(m => m.id === id);
      if (!member) return;
      nodes.push({
        id,
        x: startX + i * (NODE_W + H_GAP),
        y,
        w: NODE_W,
        h: NODE_H,
        member,
        gen,
      });
    });
  });

  // Build edges -- draw lines between related nodes
  const edgeSet = new Set();
  const edges   = [];

  relations.forEach(r => {
    const edgeKey = [r.fromId, r.toId].sort().join('|');
    if (edgeSet.has(edgeKey)) return;
    edgeSet.add(edgeKey);

    const nodeA = nodes.find(n => n.id === r.fromId);
    const nodeB = nodes.find(n => n.id === r.toId);
    if (!nodeA || !nodeB) return;

    const isSpouse   = ['Husband','Wife','Partner'].includes(r.relation);
    const isParChild = ['Son','Daughter','Child','Father','Mother','Parent'].includes(r.relation);

    if (isSpouse) {
      // Horizontal line between centres
      edges.push({
        type: 'spouse',
        x1: nodeA.x + nodeA.w, y1: nodeA.y + nodeA.h / 2,
        x2: nodeB.x,           y2: nodeB.y + nodeB.h / 2,
        label: '',
      });
    } else if (isParChild) {
      const parent = nodeA.gen < nodeB.gen ? nodeA : nodeB;
      const child  = nodeA.gen < nodeB.gen ? nodeB : nodeA;
      // Line from bottom of parent to top of child
      edges.push({
        type: 'parent-child',
        x1: parent.x + parent.w / 2, y1: parent.y + parent.h,
        x2: child.x  + child.w  / 2, y2: child.y,
        label: '',
      });
    } else {
      // Sibling / other -- dashed line between centres
      edges.push({
        type: 'other',
        x1: nodeA.x + nodeA.w / 2, y1: nodeA.y + nodeA.h / 2,
        x2: nodeB.x + nodeB.w / 2, y2: nodeB.y + nodeB.h / 2,
        label: r.relation,
      });
    }
  });

  // Calculate canvas dimensions
  const maxX = Math.max(...nodes.map(n => n.x + n.w), 300);
  const maxY = Math.max(...nodes.map(n => n.y + n.h), 200);

  return { nodes, edges, canvasW: maxX + 20, canvasH: maxY + 30 };
}

function _uuid() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}
