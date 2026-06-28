// --- DATABASE MODULE (IndexedDB Wrapper) ---
const DB_NAME = 'JEEMistakeBookDB';
const DB_VERSION = 1;
const STORE_NAME = 'mistakes';

let dbInstance = null;

function initDB() {
    return new Promise((resolve, reject) => {
        if (dbInstance) return resolve(dbInstance);
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            dbInstance = request.result;
            resolve(dbInstance);
        };
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

async function getAllMistakes() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveMistake(mistake) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(mistake);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteMistake(id) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(Number(id));
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function clearAndImportData(dataArray) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.clear().onsuccess = () => {
            if (dataArray.length === 0) return resolve();
            let count = 0;
            dataArray.forEach(item => {
                delete item.id; // Regenerate local IDs sequentially to prevent indexing bugs
                const req = store.add(item);
                req.onsuccess = () => {
                    count++;
                    if (count === dataArray.length) resolve();
                };
            });
        };
        transaction.onerror = () => reject(transaction.error);
    });
}

// --- DATA STRUCTURE CONFIGURATION ---
const DATA_CONFIG = {
    "Physics": [
        "Units & Dimensions", "Experimental Physics & Errors", "Vectors", "Kinematics",
        "Laws of Motion", "Friction", "Circular Motion", "Work, Energy & Power",
        "Centre of Mass", "Rotational Motion", "Gravitation", "Properties of Matter",
        "Fluid Mechanics", "Surface Tension", "Elasticity", "Simple Harmonic Motion",
        "Waves", "Sound Waves", "Kinetic Theory of Gases", "Thermodynamics",
        "Calorimetry", "Heat Transfer", "Electrostatics", "Capacitors", "Current Electricity",
        "Magnetic Effects of Current", "Magnetism", "Electromagnetic Induction",
        "Alternating Current", "Electromagnetic Waves", "Ray Optics", "Wave Optics",
        "Dual Nature of Matter", "Atoms", "Nuclei", "Semiconductor Electronics", "Modern Physics"
    ],
    "Chemistry": [
        "Mole Concept", "Atomic Structure", "States of Matter", "Thermodynamics",
        "Thermochemistry", "Chemical Equilibrium", "Ionic Equilibrium", "Redox Reactions",
        "Solutions", "Electrochemistry", "Chemical Kinetics", "Surface Chemistry", "Solid State",
        "Periodic Table", "Chemical Bonding", "Hydrogen", "s-Block", "p-Block", "d & f Block",
        "Coordination Compounds", "Metallurgy", "Qualitative Analysis", "Environmental Chemistry",
        "General Organic Chemistry", "Isomerism", "Hydrocarbons", "Haloalkanes & Haloarenes",
        "Alcohols, Phenols & Ethers", "Aldehydes & Ketones", "Carboxylic Acids", "Amines",
        "Biomolecules", "Polymers", "Chemistry in Everyday Life", "Practical Organic Chemistry", "Named Reactions"
    ],
    "Mathematics": [
        "Sets", "Relations", "Functions", "Logarithms", "Quadratic Equations", "Sequence & Series",
        "Binomial Theorem", "Permutation & Combination", "Probability", "Mathematical Induction",
        "Complex Numbers", "Matrices", "Determinants", "Vector Algebra", "3D Geometry",
        "Straight Line", "Circle", "Parabola", "Ellipse", "Hyperbola", "Limits", "Continuity",
        "Differentiability", "Application of Derivatives", "Indefinite Integration",
        "Definite Integration", "Area Under Curve", "Differential Equations", "Statistics",
        "Trigonometric Functions", "Trigonometric Equations", "Inverse Trigonometric Functions"
    ]
};

const MISTAKE_TYPES = ["Concept", "Calculation", "Formula", "Silly Mistake", "Wrong Approach", "Time Management", "Other"];
const SOURCES = ["Coaching", "PYQ", "Test", "Module", "Book", "Other"];

// --- APPLICATION STATE ---
let state = {
    currentSubject: null,
    currentChapter: null,
    editingMistakeId: null,
    tempImages: [] 
};

// --- IMAGE COMPRESSION ENGINE ---
function compressAndConvertImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 900; // Balanced high-resolution storage ceiling
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                // Compressed down to high-efficiency progressive JPEG
                resolve(canvas.toDataURL('image/jpeg', 0.70));
            };
        };
    });
}

// --- VIEW ENGINE CONTROLLER ---
function setView(viewHtml, initFunction = null) {
    const main = document.getElementById('main-content');
    main.innerHTML = viewHtml;
    if (initFunction) initFunction();
    window.scrollTo(0, 0);
}

// --- VIEW RENDERERS ---

async function renderHome() {
    state.currentSubject = null;
    state.currentChapter = null;
    
    const allMistakes = await getAllMistakes();
    
    // Calculated performance quick-stats block
    const totalCount = allMistakes.length;
    const criticalCount = allMistakes.filter(m => m.difficulty === 'Hard').length;
    const calculationErrors = allMistakes.filter(m => m.mistakeType === 'Calculation').length;

    let html = `
        <div style="margin-bottom: 1.5rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.75rem;">
            <div style="background: var(--bg-secondary); padding: 0.75rem; border-radius: 8px; text-align: center; border: 1px solid var(--border);">
                <div style="font-size: 1.25rem; font-weight: bold; color: var(--accent);">${totalCount}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Total Mistakes</div>
            </div>
            <div style="background: var(--bg-secondary); padding: 0.75rem; border-radius: 8px; text-align: center; border: 1px solid var(--border);">
                <div style="font-size: 1.25rem; font-weight: bold; color: var(--danger);">${criticalCount}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Hard Blocks</div>
            </div>
            <div style="background: var(--bg-secondary); padding: 0.75rem; border-radius: 8px; text-align: center; border: 1px solid var(--border);">
                <div style="font-size: 1.25rem; font-weight: bold; color: #f59e0b;">${calculationErrors}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Calculation Slips</div>
            </div>
        </div>
        <div class="grid">
    `;
    
    for (const subject of Object.keys(DATA_CONFIG)) {
        const count = allMistakes.filter(m => m.subject === subject).length;
        html += `
            <div class="card" onclick="window.navigateToSubject('${subject}')">
                <h2>${subject}</h2>
                <p style="color: var(--text-secondary); margin-top:0.5rem; font-size: 0.95rem;">${count} errors recorded</p>
            </div>
        `;
    }
    html += `</div>`;
    setView(html);
}

window.navigateToSubject = async function(subject) {
    state.currentSubject = subject;
    const allMistakes = await getAllMistakes();
    
    let html = `
        <div style="margin-bottom: 1rem;">
            <button class="btn secondary-btn" onclick="window.renderHome()">⬅️ Back to Subjects</button>
            <h2 style="margin-top:1rem;">${subject} Chapters</h2>
        </div>
        <div class="grid">
    `;
    
    DATA_CONFIG[subject].forEach(chapter => {
        const chapterMistakes = allMistakes.filter(m => m.subject === subject && m.chapter === chapter);
        const count = chapterMistakes.length;
        let lastUpdated = "Never";
        if(count > 0) {
            const timestamps = chapterMistakes.map(m => new Date(m.date).getTime());
            lastUpdated = new Date(Math.max(...timestamps)).toLocaleDateString();
        }
        
        html += `
            <div class="card" onclick="window.navigateToChapter('${chapter}')">
                <h3>${chapter}</h3>
                <p style="color: var(--text-secondary); font-size:0.9rem; margin-top:0.5rem;">Total Mistakes: <strong>${count}</strong></p>
                <p style="color: var(--text-secondary); font-size:0.8rem;">Updated: ${lastUpdated}</p>
            </div>
        `;
    });
    
    html += `</div>`;
    setView(html);
};

window.navigateToChapter = async function(chapter) {
    state.currentChapter = chapter;
    const allMistakes = await getAllMistakes();
    const mistakes = allMistakes.filter(m => m.subject === state.currentSubject && m.chapter === chapter);
    
    let html = `
        <div style="margin-bottom:1rem;">
            <button class="btn secondary-btn" onclick="window.navigateToSubject('${state.currentSubject}')">⬅️ Back to Chapters</button>
        </div>
        <div class="chapter-meta-box">
            <h2>${chapter}</h2>
            <p style="color:var(--text-secondary); margin: 0.25rem 0 0.75rem 0;">Subject: ${state.currentSubject} &bull; Total Logs: ${mistakes.length}</p>
            <button class="btn primary-btn" onclick="window.renderMistakeForm()">➕ Add New Mistake</button>
        </div>
        
        <div class="filter-bar">
            <input type="text" id="search-input" class="form-control" placeholder="🔍 Search title, notes, subtopic or tags...">
            <select id="filter-difficulty" class="form-control">
                <option value="">All Difficulties</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
            </select>
            <select id="filter-type" class="form-control">
                <option value="">All Error Types</option>
                ${MISTAKE_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
            </select>
            <select id="filter-source" class="form-control">
                <option value="">All Sources</option>
                ${SOURCES.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
        </div>

        <div id="mistake-list" class="grid" style="grid-template-columns:1fr;"></div>
    `;
    
    setView(html, () => {
        const searchInput = document.getElementById('search-input');
        const filterDiff = document.getElementById('filter-difficulty');
        const filterType = document.getElementById('filter-type');
        const filterSrc = document.getElementById('filter-source');
        
        const filterHandler = () => displayFilteredMistakes(mistakes);
        
        searchInput.addEventListener('input', filterHandler);
        filterDiff.addEventListener('change', filterHandler);
        filterType.addEventListener('change', filterHandler);
        filterSrc.addEventListener('change', filterHandler);
        
        filterHandler(); // Primary display pass
    });
};

function displayFilteredMistakes(mistakes) {
    const query = document.getElementById('search-input').value.toLowerCase();
    const diff = document.getElementById('filter-difficulty').value;
    const type = document.getElementById('filter-type').value;
    const src = document.getElementById('filter-source').value;
    
    const container = document.getElementById('mistake-list');
    
    const filtered = mistakes.filter(m => {
        const matchesSearch = m.title.toLowerCase().includes(query) || 
                              m.topic.toLowerCase().includes(query) || 
                              m.notes.toLowerCase().includes(query) ||
                              (m.tags && m.tags.toLowerCase().includes(query));
        const matchesDiff = !diff || m.difficulty === diff;
        const matchesType = !type || m.mistakeType === type;
        const matchesSrc = !src || m.source === src;
        
        return matchesSearch && matchesDiff && matchesType && matchesSrc;
    });
    
    if(filtered.length === 0) {
        container.innerHTML = `<p style="text-align:center; padding:2rem; color:var(--text-secondary);">No corresponding mistake logs match current selection parameters.</p>`;
        return;
    }
    
    container.innerHTML = filtered.map(m => `
        <div class="card" onclick="window.viewMistakeDetails(${m.id})">
            <div class="mistake-card-content">
                <div class="mistake-info">
                    <h3 style="margin-bottom:0.25rem;">${m.title}</h3>
                    <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:0.5rem;">${m.topic || 'No custom subtopic specified'} &bull; ${new Date(m.date).toLocaleDateString()}</p>
                    <div>
                        <span class="badge badge-${m.difficulty}">${m.difficulty}</span>
                        <span class="badge" style="background-color:var(--bg-tertiary); color:var(--text-primary);">${m.mistakeType}</span>
                    </div>
                </div>
                ${m.images && m.images.length > 0 ? `<img data-src="${m.images[0]}" class="mistake-thumb lazy" alt="Preview Asset">` : ''}
            </div>
        </div>
    `).join('');
    
    initLazyLoading();
}

function initLazyLoading() {
    const lazyImages = document.querySelectorAll('img.lazy');
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.classList.remove('lazy');
                    observer.unobserve(img);
                }
            });
        });
        lazyImages.forEach(img => observer.observe(img));
    } else {
        lazyImages.forEach(img => img.src = img.dataset.src);
    }
}

window.renderMistakeForm = async function(editId = null) {
    state.editingMistakeId = editId;
    let data = { title: '', topic: '', date: new Date().toISOString().split('T')[0], source: 'Coaching', difficulty: 'Medium', mistakeType: 'Concept', rootCause: '', notes: '', tags: '' };
    state.tempImages = [];
    
    if (editId) {
        const all = await getAllMistakes();
        const found = all.find(m => m.id === editId);
        if (found) {
            data = { ...found };
            state.tempImages = [...(found.images || [])];
        }
    }
    
    const html = `
        <div style="margin-bottom: 1rem;">
            <button class="btn secondary-btn" onclick="state.editingMistakeId ? window.viewMistakeDetails(${editId}) : window.navigateToChapter('${state.currentChapter}')">❌ Cancel</button>
            <h2 style="margin-top:1rem;">${editId ? 'Modify Mistake Record' : 'Log New Mistake Record'}</h2>
        </div>
        <form id="mistake-form" onsubmit="window.handleFormSubmit(event)">
            <div class="form-group">
                <label>Problem Title Summary *</label>
                <input type="text" id="form-title" class="form-control" required value="${data.title}" placeholder="e.g., Integration limit mismatch issue">
            </div>
            <div class="form-group">
                <label>Topic / Specific Subtopic</label>
                <input type="text" id="form-topic" class="form-control" value="${data.topic}" placeholder="e.g., Integration by parts">
            </div>
            <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin: 0 0 1.25rem 0;">
                <div class="form-group" style="margin:0;">
                    <label>Discovery Date</label>
                    <input type="date" id="form-date" class="form-control" value="${data.date}">
                </div>
                <div class="form-group" style="margin:0;">
                    <label>Origin Source</label>
                    <select id="form-source" class="form-control">
                        ${SOURCES.map(s => `<option value="${s}" ${data.source === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group" style="margin:0;">
                    <label>Impact Status / Difficulty</label>
                    <select id="form-difficulty" class="form-control">
                        <option value="Easy" ${data.difficulty === 'Easy' ? 'selected' : ''}>Easy</option>
                        <option value="Medium" ${data.difficulty === 'Medium' ? 'selected' : ''}>Medium</option>
                        <option value="Hard" ${data.difficulty === 'Hard' ? 'selected' : ''}>Hard</option>
                    </select>
                </div>
                <div class="form-group" style="margin:0;">
                    <label>Error Classification</label>
                    <select id="form-type" class="form-control">
                        ${MISTAKE_TYPES.map(t => `<option value="${t}" ${data.mistakeType === t ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Core Root Cause / Quick Takeaway Mantra</label>
                <input type="text" id="form-root" class="form-control" placeholder="e.g., Did not check domain restrictions before squaring both sides" value="${data.rootCause}">
            </div>
            <div class="form-group">
                <label>Strategic Mathematical Analysis & Context Review Notes</label>
                <textarea id="form-notes" class="form-control" rows="6" placeholder="Document equations, derivation shortcuts, or step-by-step structural guidelines...">${data.notes}</textarea>
            </div>
            <div class="form-group">
                <label>Meta Search Tags (Comma separated)</label>
                <input type="text" id="form-tags" class="form-control" placeholder="tricky, algebraic-slip, test-3-error" value="${data.tags}">
            </div>
            <div class="form-group">
                <label>Problem Attachments / Equation Screenshots</label>
                <div class="image-uploader" onclick="document.getElementById('file-input').click()">
                    <span>📸 Tap to snap photo or select file assets</span>
                    <input type="file" id="file-input" multiple accept="image/*" style="display:none;" onchange="window.handleImageUpload(event)">
                </div>
                <div id="form-img-previews" class="preview-container"></div>
            </div>
            <button type="submit" class="btn primary-btn" style="width:100%; padding:0.85rem; margin-top:1rem;">💾 Commit Record to Memory</button>
        </form>
    `;
    
    setView(html, renderFormPreviews);
};

window.handleImageUpload = async function(event) {
    const files = Array.from(event.target.files);
    for(const file of files) {
        const compressedBase64 = await compressAndConvertImage(file);
        state.tempImages.push(compressedBase64);
    }
    renderFormPreviews();
};

function renderFormPreviews() {
    const container = document.getElementById('form-img-previews');
    if(!container) return;
    container.innerHTML = state.tempImages.map((img, idx) => `
        <div class="preview-wrapper">
            <img src="${img}" alt="Preview Asset">
            <button type="button" class="remove-img-btn" onclick="window.removeTempImage(${idx})">&times;</button>
        </div>
    `).join('');
}

window.removeTempImage = function(idx) {
    state.tempImages.splice(idx, 1);
    renderFormPreviews();
};

window.handleFormSubmit = async function(event) {
    event.preventDefault();
    const payload = {
        subject: state.currentSubject,
        chapter: state.currentChapter,
        title: document.getElementById('form-title').value.trim(),
        topic: document.getElementById('form-topic').value.trim(),
        date: document.getElementById('form-date').value,
        source: document.getElementById('form-source').value,
        difficulty: document.getElementById('form-difficulty').value,
        mistakeType: document.getElementById('form-type').value,
        rootCause: document.getElementById('form-root').value.trim(),
        notes: document.getElementById('form-notes').value.trim(),
        tags: document.getElementById('form-tags').value.trim(),
        images: state.tempImages
    };
    
    if(state.editingMistakeId) {
        payload.id = state.editingMistakeId;
    }
    
    await saveMistake(payload);
    window.navigateToChapter(state.currentChapter);
};

window.viewMistakeDetails = async function(id) {
    const all = await getAllMistakes();
    const item = all.find(m => m.id === id);
    if(!item) return;
    
    const html = `
        <div style="margin-bottom: 1rem; display:flex; justify-content:space-between; align-items:center;">
            <button class="btn secondary-btn" onclick="window.navigateToChapter('${item.chapter}')">⬅️ Back to List</button>
            <div style="display:flex; gap:0.5rem;">
                <button class="btn secondary-btn" onclick="window.renderMistakeForm(${item.id})">✏️ Edit</button>
                <button class="btn danger-btn" onclick="window.confirmDelete(${item.id})">🗑️ Delete</button>
            </div>
        </div>
        
        <div class="mistake-view">
            <h2>${item.title}</h2>
            <div class="meta-row">
                <span><strong>${item.subject}</strong> &bull; ${item.chapter}</span><br>
                <span style="display:inline-block; margin-top:0.4rem;">Logged: ${new Date(item.date).toLocaleDateString()} &bull; Source Tracked: <strong>${item.source}</strong></span>
            </div>
            
            <div style="margin-bottom:1rem;">
                <span class="badge badge-${item.difficulty}">${item.difficulty}</span>
                <span class="badge" style="background-color:var(--bg-secondary); border:1px solid var(--border); color:var(--text-primary);">${item.mistakeType}</span>
            </div>

            ${item.rootCause ? `
                <div class="section-box">
                    <h4 style="color:var(--danger); margin-bottom:0.25rem;">⚠️ Critical Insight Root Cause</h4>
                    <p style="font-weight: 500;">${item.rootCause}</p>
                </div>
            ` : ''}

            ${item.images && item.images.length > 0 ? `
                <h4 style="margin-bottom: 0.5rem;">Visual Problem Dashboard / Scratchpad</h4>
                <div class="gallery">
                    ${item.images.map(img => `<img src="${img}" onclick="window.triggerLightbox('${img}')" alt="Problem Layout Graph">`).join('')}
                </div>
            ` : ''}

            <div class="section-box" style="white-space: pre-wrap;">
                <h4 style="margin-bottom:0.5rem; color:var(--accent);">Analysis & Analytical Rectification Notes</h4>
                ${item.notes ? item.notes : '<em style="color:var(--text-secondary)">No conceptual solutions/notes have been manually described.</em>'}
            </div>
            
            ${item.tags ? `
                <div style="font-size:0.85rem; color:var(--text-secondary)">
                    <strong>Index Tags:</strong> ${item.tags}
                </div>
            ` : ''}
        </div>
    `;
    setView(html);
};

window.confirmDelete = async function(id) {
    if(confirm("Are you sure you want to delete this recorded mistake permanently? This action cannot be undone.")) {
        await deleteMistake(id);
        window.navigateToChapter(state.currentChapter);
    }
};

window.triggerLightbox = function(src) {
    const modal = document.getElementById('lightbox-modal');
    const img = document.getElementById('lightbox-img');
    img.src = src;
    modal.classList.remove('hidden');
};

// --- BACKUP MANAGEMENT MODULE ---
function setupGlobalUI() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const updated = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', updated);
        localStorage.setItem('theme', updated);
    });
    
    const backupModal = document.getElementById('backup-modal');
    document.getElementById('backup-menu-btn').addEventListener('click', () => backupModal.classList.remove('hidden'));
    
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => backupModal.classList.add('hidden'));
    });
    
    const lightbox = document.getElementById('lightbox-modal');
    document.querySelector('.close-lightbox').addEventListener('click', () => lightbox.classList.add('hidden'));
    lightbox.addEventListener('click', (e) => { if(e.target === lightbox) lightbox.classList.add('hidden'); });

    document.getElementById('app-title').addEventListener('click', () => window.renderHome());

    // Export Logic Engine
    document.getElementById('export-btn').addEventListener('click', async () => {
        const data = await getAllMistakes();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", `JEE_MistakeBook_Backup_${new Date().toISOString().split('T')[0]}.json`);
        dlAnchorElem.click();
    });

    // Validated Backup Import Engine
    document.getElementById('import-file').addEventListener('change', function(e) {
        const reader = new FileReader();
        reader.onload = async function(event) {
            try {
                const parsed = JSON.parse(event.target.result);
                if (Array.isArray(parsed)) {
                    await clearAndImportData(parsed);
                    alert("Local dataset sync verified and fully restored successfully!");
                    backupModal.classList.add('hidden');
                    window.renderHome();
                } else {
                    alert("Invalid JSON document profile schema detected.");
                }
            } catch (err) {
                alert("Critical format parsing error processing structural file configuration.");
            }
        };
        if(e.target.files[0]) reader.readAsText(e.target.files[0]);
    });
}

// --- BOOTSTRAP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    setupGlobalUI();
    window.renderHome();
});

// PWA Offline Service Worker Registration Hook
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .catch(err => console.log('Offline Engine Initialization Paused', err));
    });
}

window.renderHome = renderHome;
