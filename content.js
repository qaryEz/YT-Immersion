document.addEventListener('yt-navigate-finish', onNavigate);
window.addEventListener('load', init);

// --- グローバル変数 ---
let bridgeIframe = null;
let myPeerId = null;
let lastTitle = ""; 
let lastLyricIndex = -1; 
let originalParent = null;
let originalNextSibling = null;
let targetVideo = null;
let rootContainer = null;
let lyricsData = [];
let idleTimer = null;

// --- 初期化 ---
function init() {
    try {
        setupBridge();
        addMVButton();
        if (sessionStorage.getItem('mv_mode_active') === 'true' && !rootContainer) {
            setTimeout(() => startMVMode(true), 1500);
        }
    } catch(e) { console.error("Init error:", e); }
}

async function onNavigate() {
    init();
    const isMVModeActive = sessionStorage.getItem('mv_mode_active') === 'true';
    if (isMVModeActive) {
        if (rootContainer) endMVMode(true);
        await new Promise(r => setTimeout(r, 1000));
        startMVMode(true);
    }
}

function addMVButton() {
    try {
        if (document.querySelector('.ytp-mv-mode-button')) return;
        const controlBar = document.querySelector('.ytp-right-controls');
        if (controlBar) {
            const btn = document.createElement('div');
            btn.className = 'ytp-button ytp-mv-mode-button';
            btn.innerText = 'MVモード';
            btn.style.textAlign = 'center';
            btn.style.width = 'auto';
            btn.onclick = () => startMVMode(false);
            controlBar.insertBefore(btn, controlBar.firstChild);
        }
    } catch(e) { console.error("Button add error:", e); }
}

// --- MVモード開始 ---
async function startMVMode(isAuto = false) {
    if (rootContainer) return;
    targetVideo = document.querySelector('.video-stream.html5-main-video') || document.querySelector('video');
    if (!targetVideo) { setTimeout(() => startMVMode(isAuto), 1000); return; }
    sessionStorage.setItem('mv_mode_active', 'true');

    try {
        if (!targetVideo.getAttribute('crossOrigin')) {
            targetVideo.setAttribute('crossOrigin', 'anonymous');
        }
    } catch(e) {}

    originalParent = targetVideo.parentNode;
    originalNextSibling = targetVideo.nextSibling;

    rootContainer = document.createElement('div');
    rootContainer.id = 'mv-root-container';
    rootContainer.appendChild(targetVideo);

    const styleEl = document.createElement('style');
    // ★ここを修正: 他のボタンとデザインを完全に統一★
    styleEl.textContent = `
        #mv-shot-btn {
            position: absolute; bottom: 40px; right: 40px; z-index: 2000;
            opacity: 0; pointer-events: none;
            transition: opacity 0.4s, transform 0.2s, background 0.2s;
            
            /* ガラスデザインの適用 */
            background: rgba(20, 20, 20, 0.6);
            backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: rgba(255, 255, 255, 0.9);
            
            /* 形状の統一 (角丸・余白) */
            border-radius: 30px;
            padding: 10px 24px;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.02em;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        }
        #mv-shot-btn.visible { opacity: 1; pointer-events: auto; }
        
        #mv-shot-btn:hover { 
            transform: scale(1.05); 
            background: rgba(255, 255, 255, 0.2);
            border-color: rgba(255, 255, 255, 0.3);
            color: #fff;
            box-shadow: 0 8px 25px rgba(0,0,0,0.5);
        }
        #mv-shot-btn:active { transform: scale(0.95); }

        /* 歌詞選択UI */
        .lyric-selection-container {
            flex: 1; max-width: 320px; 
            background: rgba(30, 30, 30, 0.6);
            backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            border-radius: 16px; padding: 20px; overflow-y: auto;
            max-height: 60vh; border: 1px solid rgba(255,255,255,0.15);
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            display: flex; flex-direction: column;
        }
        .lyric-selection-container::-webkit-scrollbar { display: none; }
        
        .lyric-select-item {
            padding: 10px 14px; margin-bottom: 6px; border-radius: 8px;
            cursor: pointer; color: rgba(255,255,255,0.6); font-size: 13px;
            transition: all 0.2s; line-height: 1.4;
            border-left: 3px solid transparent;
        }
        .lyric-select-item:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .lyric-select-item.selected {
            background: rgba(255,255,255,0.15); color: #fff; font-weight: 600;
            border-left: 3px solid #fff;
        }
        .lyric-selection-header {
            font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 15px;
            letter-spacing: 0.05em; text-align: center;
        }
    `;
    rootContainer.appendChild(styleEl);

    const overlayContent = document.createElement('div');
    overlayContent.id = 'mv-overlay-content';
    
    overlayContent.innerHTML = `
        <div id="mv-info-area"></div>
        <div id="mv-lyrics-area"></div>
        <button id="mv-close-btn" class="mv-glass-btn">閉じる</button>
        <button id="mv-qr-btn" class="mv-glass-btn"><span style="margin-right:8px;">📱</span> Immersion Connect</button>
        <button id="mv-shot-btn" class="mv-glass-btn">📸 Shot</button>

        <div id="mv-qr-overlay" style="display:none;">
            <div id="mv-qr-card">
                <h3>スマホでスキャン</h3>
                <div id="qrcode"></div>
                <p>同じWi-Fi推奨ですが、4Gでも繋がります</p>
                <button class="qr-close-btn" id="qr-close-action">閉じる</button>
            </div>
        </div>
    `;

    const closeBtn = overlayContent.querySelector('#mv-close-btn');
    if(closeBtn) closeBtn.onclick = () => endMVMode(false);
    
    const qrBtn = overlayContent.querySelector('#mv-qr-btn');
    if(qrBtn) qrBtn.onclick = showQRCode;
    
    const shotBtn = overlayContent.querySelector('#mv-shot-btn');
    if(shotBtn) shotBtn.onclick = startHybridShotSequence;

    const qrOverlay = overlayContent.querySelector('#mv-qr-overlay');
    const qrClose = overlayContent.querySelector('#qr-close-action');
    if(qrClose) qrClose.onclick = (e) => { e.stopPropagation(); if(qrOverlay) qrOverlay.style.display = 'none'; };
    if(qrOverlay) qrOverlay.onclick = (e) => { if(e.target === qrOverlay) qrOverlay.style.display = 'none'; };

    const sidebarTrigger = document.createElement('div');
    sidebarTrigger.id = 'mv-sidebar-trigger';
    sidebarTrigger.onmouseenter = () => { document.getElementById('mv-sidebar')?.classList.add('visible'); };
    rootContainer.appendChild(sidebarTrigger);

    const sidebar = document.createElement('div');
    sidebar.id = 'mv-sidebar';
    sidebar.onmouseleave = () => { document.getElementById('mv-sidebar')?.classList.remove('visible'); };
    sidebar.innerHTML = '<h2>次はこちら</h2><div id="mv-next-list">読み込み中...</div>';
    rootContainer.appendChild(sidebar);

    rootContainer.appendChild(overlayContent);
    document.body.appendChild(rootContainer);

    targetVideo.addEventListener('timeupdate', syncLyrics);
    targetVideo.addEventListener('play', () => syncToRemote());
    targetVideo.addEventListener('pause', () => syncToRemote());

    document.addEventListener('mousemove', onUserAction);
    document.addEventListener('click', onUserAction);
    onUserAction(); 

    if (!isAuto) {
        rootContainer.requestFullscreen().catch(() => {});
    }

    try { updateMVContent().catch(e => console.log("Content update warning:", e)); } catch(e){}
    if (targetVideo.paused) targetVideo.play();
}

function endMVMode(keepActive = false) {
    if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }

    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    
    if (rootContainer) {
        rootContainer.remove();
        rootContainer = null;
    }

    if (targetVideo && originalParent) {
        try {
            if (originalNextSibling && originalParent.contains(originalNextSibling)) {
                originalParent.insertBefore(targetVideo, originalNextSibling);
            } else {
                originalParent.appendChild(targetVideo);
            }
        } catch (e) { }
    }
    
    if (targetVideo) {
        targetVideo.removeEventListener('timeupdate', syncLyrics);
    }
    
    document.removeEventListener('mousemove', onUserAction);
    document.removeEventListener('click', onUserAction);
    
    if (!keepActive) {
        targetVideo = null;
        sessionStorage.removeItem('mv_mode_active');
    }
}

async function updateMVContent(retryCount = 0) {
    const infoArea = document.getElementById('mv-info-area');
    const lyricsArea = document.getElementById('mv-lyrics-area');
    
    if (retryCount === 0) {
        if(infoArea) infoArea.innerHTML = '';
        if(lyricsArea) lyricsArea.innerHTML = '<p style="color:rgba(255,255,255,0.3); font-size:20px; padding:20px;">読み込み中...</p>';
        lyricsData = [];
        await new Promise(r => setTimeout(r, 1000)); 
    }

    let segments = document.querySelectorAll('ytd-transcript-segment-renderer');
    if (segments.length === 0) {
        const buttons = document.querySelectorAll('button');
        let openTranscriptBtn = null;
        for (let btn of buttons) {
            if (btn.innerText.includes('文字起こし') || btn.getAttribute('aria-label')?.includes('文字起こし')) {
                openTranscriptBtn = btn; break;
            }
        }
        if (openTranscriptBtn) {
            openTranscriptBtn.click();
            await new Promise(r => setTimeout(r, 1500)); 
            segments = document.querySelectorAll('ytd-transcript-segment-renderer');
        }
    }

    if (segments.length === 0) {
        if (retryCount < 3) { 
            setTimeout(() => updateMVContent(retryCount + 1), 1500); 
            return; 
        } else if(lyricsArea) {
            lyricsArea.innerHTML = '<p style="color:rgba(255,255,255,0.3); font-size:20px; padding:20px;">歌詞なし</p>';
        }
    } else {
        const closeTranscriptBtn = document.querySelector('ytd-transcript-renderer button[aria-label="閉じる"]');
        if(closeTranscriptBtn) closeTranscriptBtn.click();

        lyricsData = Array.from(segments).map(seg => {
            const timeStr = seg.querySelector('.segment-timestamp').textContent.trim();
            const text = seg.querySelector('.segment-text').textContent.trim();
            const parts = timeStr.split(':').map(Number);
            let seconds = 0;
            if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
            if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            return { time: seconds, text: text, el: null };
        });

        if(lyricsArea) {
            lyricsArea.innerHTML = '';
            lyricsData.forEach(line => {
                const p = document.createElement('p');
                p.className = 'lyric-line';
                p.innerText = line.text;
                p.onclick = () => { if(targetVideo) targetVideo.currentTime = line.time; };
                lyricsArea.appendChild(p);
                line.el = p;
            });
        }
    }

    let rawTitle = document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent.trim() || "";
    let songTitle = rawTitle;
    let rawArtist = document.querySelector('ytd-video-owner-renderer ytd-channel-name a')?.textContent.trim() || "";
    
    const bracketMatch = rawTitle.match(/『(.*?)』/);
    if (bracketMatch) songTitle = bracketMatch[1];
    else songTitle = songTitle.replace(/【.*?】/g, '').replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').replace(/Official\s*Music\s*Video/gi, '').replace(/MV/gi, '').replace(/full/gi, '').replace(/公式/g, '').replace(/\//g, '').replace(rawArtist, '').trim();
    let artistName = rawArtist.replace(/Official\s*Channel/gi, '').replace(/公式/g, '').trim();

    if(infoArea) {
        infoArea.innerHTML = `<h1 id="mv-song-title">${songTitle}</h1><p id="mv-artist-name">${artistName}</p>`;
        lastTitle = "";
        syncToRemote(true);
    }
    
    try { updateSidebarContent(0); } catch(e){}
}

function updateSidebarContent(retryCount) {
    const listContainer = document.getElementById('mv-next-list');
    if (!listContainer) return;
    
    let items = document.querySelectorAll('ytd-playlist-panel-video-renderer');
    if (items.length === 0) items = document.querySelectorAll('ytd-compact-video-renderer');
    
    if (items.length === 0) {
        if (retryCount < 5) setTimeout(() => updateSidebarContent(retryCount + 1), 1000);
        else listContainer.innerHTML = '<p style="color:#888; padding:20px;">リストが見つかりませんでした</p>';
        return;
    }
    
    listContainer.innerHTML = '';
    const limit = Math.min(items.length, 20);
    
    for (let i = 0; i < limit; i++) {
        const item = items[i];
        const linkEl = item.querySelector('a#thumbnail');
        const titleEl = item.querySelector('#video-title');
        const imgEl = item.querySelector('img');
        let artistEl = item.querySelector('.ytd-channel-name') || item.querySelector('#byline');
        
        if (!linkEl || !titleEl) continue;
        
        const card = document.createElement('a');
        card.className = 'mv-next-item';
        card.href = linkEl.href; 
        const src = imgEl ? (imgEl.src || imgEl.getAttribute('src')) : '';
        
        card.innerHTML = `
            <img src="${src}" class="mv-next-thumb" loading="lazy">
            <div class="mv-next-info">
                <div class="mv-next-title">${titleEl.textContent.trim()}</div>
                <div class="mv-next-artist">${artistEl ? artistEl.textContent.trim() : ''}</div>
            </div>
        `;
        listContainer.appendChild(card);
    }
}

function onUserAction(e) {
    const infoArea = document.getElementById('mv-info-area');
    const closeBtn = document.getElementById('mv-close-btn');
    const qrBtn = document.getElementById('mv-qr-btn'); 
    const shotBtn = document.getElementById('mv-shot-btn'); 

    if(infoArea) {
        if(infoArea) infoArea.classList.add('visible');
        if(closeBtn) closeBtn.classList.add('visible');
        if(qrBtn) qrBtn.classList.add('visible');
        if(shotBtn) shotBtn.classList.add('visible');

        if (idleTimer) clearTimeout(idleTimer);
        
        idleTimer = setTimeout(() => {
            const ia = document.getElementById('mv-info-area');
            const cb = document.getElementById('mv-close-btn');
            const qb = document.getElementById('mv-qr-btn');
            const sb = document.getElementById('mv-shot-btn');
            
            if(ia) ia.classList.remove('visible');
            if(cb) cb.classList.remove('visible');
            if(qb) qb.classList.remove('visible');
            if(sb) sb.classList.remove('visible');
        }, 3000);
    }

    if (e && e.type === 'click' && rootContainer && !document.fullscreenElement) {
        const target = e.target;
        if (target.closest('#shot-result-overlay')) return;
        if (target.closest('#shot-selector-overlay')) return; 
        if (target.closest('#mv-qr-overlay')) return;
        
        if (target.id !== 'mv-close-btn' && 
            !target.closest('a') && 
            !target.closest('#mv-sidebar') && 
            target.id !== 'mv-qr-btn' && 
            target.id !== 'mv-shot-btn') {
            rootContainer.requestFullscreen().catch(() => {});
        }
    }
}

function syncLyrics() {
    if(!targetVideo) return;
    const currentTime = targetVideo.currentTime;
    
    if (bridgeIframe) {
        sendToRemote({
            type: 'time',
            current: currentTime,
            duration: targetVideo.duration || 0
        });
    }

    let activeIndex = -1;
    for (let i = 0; i < lyricsData.length; i++) {
        if (lyricsData[i].time <= currentTime) activeIndex = i; else break;
    }
    
    let isInstrumental = false;
    if (activeIndex !== -1) {
        const currentLine = lyricsData[activeIndex];
        const nextLine = lyricsData[activeIndex + 1];
        const timeSinceStart = currentTime - currentLine.time;
        const timeToNext = nextLine ? (nextLine.time - currentTime) : 999;
        
        if (timeSinceStart > 5 && timeToNext > 5) isInstrumental = true;
        const gap = nextLine ? (nextLine.time - currentLine.time) : 0;
        if (gap > 10 && timeSinceStart > 8) isInstrumental = true;
    }

    if (activeIndex !== lastLyricIndex) {
        lastLyricIndex = activeIndex;
        if (bridgeIframe) {
            sendToRemote({
                type: 'lyric_index',
                index: activeIndex,
                isInstrumental: isInstrumental
            });
        }
    }

    lyricsData.forEach((line, i) => {
        if (!line || !line.el) return;

        if (i === activeIndex && !isInstrumental) {
            if (!line.el.classList.contains('active')) {
                line.el.classList.add('active');
                line.el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        } else {
            line.el.classList.remove('active');
        }
    });
}

function setupBridge() {
    if (document.getElementById('mv-bridge-frame')) return;

    bridgeIframe = document.createElement('iframe');
    bridgeIframe.id = 'mv-bridge-frame';
    bridgeIframe.style.display = 'none';
    bridgeIframe.src = chrome.runtime.getURL('bridge.html');
    document.body.appendChild(bridgeIframe);
    console.log("MV Mode: Bridge Iframe created");

    window.addEventListener('message', (event) => {
        if (!event.data) return;
        const msg = event.data;

        switch (msg.type) {
            case 'PEER_OPEN':
                myPeerId = msg.id;
                break;
            case 'REMOTE_COMMAND':
                handleRemoteCommand(msg.data);
                break;
            case 'PEER_CONNECTED':
                setTimeout(() => syncToRemote(true), 1000);
                break;
        }
    });
}

function sendToRemote(payload) {
    if (bridgeIframe && bridgeIframe.contentWindow) {
        bridgeIframe.contentWindow.postMessage({
            type: 'SEND_TO_PEER',
            payload: payload
        }, '*');
    }
}

function handleRemoteCommand(data) {
    if (!targetVideo) return;
    switch (data.command) {
        case 'playpause': targetVideo.paused ? targetVideo.play() : targetVideo.pause(); break;
        case 'next':
            const nextBtn = document.querySelector('.ytp-next-button');
            if (nextBtn) nextBtn.click();
            break;
        case 'prev':
            if (targetVideo.currentTime > 5) targetVideo.currentTime = 0;
            else window.history.back();
            break;
        case 'volume': targetVideo.volume = data.value / 100; break;
        case 'seek': targetVideo.currentTime += data.value; break;
        case 'scrub': targetVideo.currentTime = data.value; break;
    }
}

function syncToRemote(forceFullData = false) {
    if (!targetVideo || !bridgeIframe) return;
    
    const titleEl = document.getElementById('mv-song-title') || document.querySelector('h1.ytd-video-primary-info-renderer');
    const artistEl = document.getElementById('mv-artist-name') || document.querySelector('ytd-video-owner-renderer ytd-channel-name a');
    const thumbUrl = getHighResThumbnail();
    
    const currentTitle = titleEl ? titleEl.textContent.trim() : 'Loading...';
    
    let lyricsToSend = null;
    if (forceFullData || currentTitle !== lastTitle) {
        lyricsToSend = lyricsData.map(l => ({ time: l.time, text: l.text }));
        lastTitle = currentTitle;
        lastLyricIndex = -1;
    }

    sendToRemote({
        type: 'info',
        title: currentTitle,
        artist: artistEl ? artistEl.textContent.trim() : '',
        isPlaying: !targetVideo.paused,
        thumbnail: thumbUrl,
        duration: targetVideo.duration,
        allLyrics: lyricsToSend 
    });
}

function showQRCode() {
    const qrOverlay = document.getElementById('mv-qr-overlay');
    const qrDiv = document.getElementById('qrcode');
    if (!qrOverlay || !qrDiv) return;
    
    if (!myPeerId) {
        alert("ID生成中...少し待ってから再度押してください"); 
        return; 
    }
    
    qrDiv.innerHTML = '';
    qrOverlay.style.display = 'flex';

    const remoteUrl = `https://naikaku1.github.io/immersion_connect/?id=${myPeerId}`; 
    new QRCode(qrDiv, { text: remoteUrl, width: 180, height: 180 });
}

function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
}

function getHighResThumbnail() {
    const videoId = getVideoId();
    if (videoId) return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
    return "";
}

// ==========================================
// ★★★ ハイブリッド・ベストショット機能 ★★★
// ==========================================

async function startHybridShotSequence() {
    const video = document.querySelector('.video-stream.html5-main-video');
    if (!video) return;

    const btn = document.getElementById('mv-shot-btn');
    if(btn) {
        btn.innerText = "連写解析中...";
        btn.style.background = "rgba(255, 50, 50, 0.8)";
    }

    try {
        const frames = await tryBurstCapture(video);
        if(frames && frames.length > 0) {
            showShotSelector(frames);
            if(btn) { btn.innerText = "📸 Shot"; btn.style.background = ""; }
            return; 
        }
    } catch(e) {
        console.log("Burst capture blocked (CORS/DRM). Falling back to Screenshot.", e);
    }

    if(btn) btn.innerText = "高画質撮影中...";
    takeSingleScreenShot();
}

async function tryBurstCapture(video) {
    const wasPaused = video.paused;
    const currentTime = video.currentTime;
    
    const rewindTime = 0.5;
    if(currentTime > rewindTime) video.currentTime = currentTime - rewindTime;
    if(video.paused) await video.play();

    const frames = [];
    const captureDuration = 1000;
    const startTime = Date.now();

    try {
        while(Date.now() - startTime < captureDuration) {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            try {
                const dummy = ctx.getImageData(0,0,1,1);
            } catch(securityError) {
                throw new Error("Canvas Tainted");
            }

            const score = calculateSharpness(ctx, canvas.width, canvas.height);
            frames.push({ canvas, score });
            
            await new Promise(r => requestAnimationFrame(r));
        }
    } catch(e) {
        if(wasPaused) video.pause();
        video.currentTime = currentTime;
        throw e;
    }

    if(wasPaused) video.pause();
    video.currentTime = currentTime;

    frames.sort((a,b) => b.score - a.score);
    return frames.slice(0, 6);
}

async function takeSingleScreenShot() {
    const video = document.querySelector('.video-stream.html5-main-video');
    const btn = document.getElementById('mv-shot-btn');
    
    const wasPaused = video.paused;
    video.pause();

    const overlay = document.getElementById('mv-overlay-content');
    const sidebar = document.getElementById('mv-sidebar');
    const trigger = document.getElementById('mv-sidebar-trigger');
    if(overlay) overlay.style.display = 'none';
    if(sidebar) sidebar.style.display = 'none';
    if(trigger) trigger.style.display = 'none';

    await new Promise(r => setTimeout(r, 200));

    try {
        const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_CURRENT_TAB' });
        
        if(overlay) overlay.style.display = 'block';
        if(sidebar) sidebar.style.display = 'block';
        if(trigger) trigger.style.display = 'block';
        if(!wasPaused) video.play();

        if (response && response.success && response.dataUrl) {
            processScreenshot(response.dataUrl, video);
        } else {
            alert("撮影エラー: " + (response ? response.error : "Unknown"));
        }
    } catch (e) {
        if(overlay) overlay.style.display = 'block';
        if(sidebar) sidebar.style.display = 'block';
        if(trigger) trigger.style.display = 'block';
        alert("エラー: " + e.message);
    } finally {
        if(btn) { btn.innerText = "📸 Shot"; btn.style.background = ""; }
    }
}

function calculateSharpness(ctx, w, h) {
    const sampleW = 120;
    const sampleH = (h/w) * sampleW;
    const sc = document.createElement('canvas');
    sc.width = sampleW; sc.height = sampleH;
    const sCtx = sc.getContext('2d');
    
    sCtx.drawImage(ctx.canvas, 0,0, sampleW, sampleH);
    
    const centerX = Math.floor(sampleW * 0.25);
    const centerY = Math.floor(sampleH * 0.2);
    const cropW = Math.floor(sampleW * 0.5);
    const cropH = Math.floor(sampleH * 0.5);
    
    const data = sCtx.getImageData(centerX, centerY, cropW, cropH).data;
    let score = 0;
    
    for(let i=0; i<data.length; i+=16) {
        if(i+4 < data.length) {
            score += Math.abs(data[i] - data[i+4]); 
        }
    }
    return score;
}

function showShotSelector(frames) {
    const old = document.getElementById('shot-selector-overlay');
    if(old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'shot-selector-overlay';
    const root = document.getElementById('mv-root-container') || document.body;
    
    Object.assign(overlay.style, {
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.85)', zIndex: 100000,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(10px)'
    });

    const title = document.createElement('h2');
    title.innerText = "ベストショットを選択";
    title.style.color = "#fff";
    title.style.marginBottom = "20px";
    overlay.appendChild(title);

    const list = document.createElement('div');
    Object.assign(list.style, {
        display: 'flex', flexWrap: 'wrap', gap: '15px', 
        justifyContent: 'center', maxWidth: '95%', padding: '10px'
    });

    frames.forEach(f => {
        const img = document.createElement('img');
        try {
            img.src = f.canvas.toDataURL('image/jpeg', 0.8);
            Object.assign(img.style, {
                height: '140px', cursor: 'pointer', borderRadius: '8px',
                border: '2px solid rgba(255,255,255,0.2)', transition: 'transform 0.2s'
            });
            img.onmouseenter = () => { img.style.borderColor = '#fff'; img.style.transform = "scale(1.05)"; };
            img.onmouseleave = () => { img.style.borderColor = 'rgba(255,255,255,0.2)'; img.style.transform = "scale(1)"; };
            
            img.onclick = () => {
                generateAndShare(f.canvas); // 初回は歌詞なし
                overlay.remove();
            };
            list.appendChild(img);
        } catch(e){}
    });

    const closeBtn = document.createElement('button');
    closeBtn.innerText = "キャンセル";
    // ★統一: mv-glass-btn
    closeBtn.className = "mv-glass-btn";
    closeBtn.style.marginTop = "20px";
    closeBtn.onclick = () => overlay.remove();

    overlay.appendChild(list);
    overlay.appendChild(closeBtn);
    root.appendChild(overlay);
}

function processScreenshot(dataUrl, videoEl) {
    const img = new Image();
    img.onload = () => {
        let rect = videoEl.getBoundingClientRect();
        if (!rect || rect.width === 0) rect = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

        const scaleX = img.naturalWidth / window.innerWidth;
        const scaleY = img.naturalHeight / window.innerHeight;

        const canvas = document.createElement('canvas');
        canvas.width = rect.width * scaleX;
        canvas.height = rect.height * scaleY;
        
        const ctx = canvas.getContext('2d');
        const sx = (rect.left + window.scrollX) * scaleX;
        const sy = (rect.top + window.scrollY) * scaleY;

        ctx.fillStyle = "#000";
        ctx.fillRect(0,0,canvas.width, canvas.height);
        ctx.drawImage(img, sx, sy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        
        generateAndShare(canvas); // 初回は歌詞なし
    };
    img.src = dataUrl;
}

// ★ デザインを「推しファースト」に完全変更 (シネマティック・ミニマル) ★
function generateAndShare(sourceCanvas, selectedLyrics = []) {
    if(sourceCanvas.width === 0) return;

    let songTitle = "Song Title";
    let artistName = "Artist Name";
    try {
        const titleEl = document.getElementById('mv-song-title') || document.querySelector('h1.ytd-video-primary-info-renderer');
        if(titleEl) songTitle = titleEl.innerText.trim();
        const artistEl = document.getElementById('mv-artist-name') || document.querySelector('ytd-video-owner-renderer ytd-channel-name a');
        if(artistEl) artistName = artistEl.innerText.trim();
    } catch(e) {}

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = sourceCanvas.width;
    finalCanvas.height = sourceCanvas.height;
    const ctx = finalCanvas.getContext('2d');

    // 1. 画像を描画
    ctx.drawImage(sourceCanvas, 0, 0);

    // 2. グラデーション
    const lyricsHeight = selectedLyrics.length > 0 ? (finalCanvas.height * 0.15) : 0;
    const gradHeight = (finalCanvas.height * 0.25) + lyricsHeight;
    
    const grad = ctx.createLinearGradient(0, finalCanvas.height - gradHeight, 0, finalCanvas.height);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.4, "rgba(0,0,0,0.3)"); 
    grad.addColorStop(1, "rgba(0,0,0,0.85)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, finalCanvas.height - gradHeight, finalCanvas.width, gradHeight);

    // 3. テキスト描画
    const baseSize = finalCanvas.width * 0.025;
    const margin = finalCanvas.width * 0.04;
    let currentY = finalCanvas.height - margin;

    // ロゴ
    const logoSize = baseSize * 0.35;
    ctx.font = `400 ${logoSize}px -apple-system, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.textAlign = "right";
    ctx.shadowBlur = 0;
    ctx.fillText("YouTube Immersion Shot", finalCanvas.width - margin, currentY);
    
    // アーティスト名
    ctx.textAlign = "left";
    ctx.font = `500 ${baseSize * 0.7}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(artistName, margin, currentY);
    
    currentY -= (baseSize * 1.6); 

    // 曲名
    ctx.font = `800 ${baseSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillText(songTitle, margin, currentY);

    // 歌詞描画
    if (selectedLyrics.length > 0) {
        currentY -= (baseSize * 2.5);
        const lyricSize = baseSize * 0.65;
        ctx.font = `600 ${lyricSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.shadowBlur = 6;
        for (let i = selectedLyrics.length - 1; i >= 0; i--) {
            ctx.fillText(selectedLyrics[i], margin, currentY);
            currentY -= (lyricSize * 1.6); 
        }
    }

    showResultOverlay(finalCanvas, songTitle, sourceCanvas, selectedLyrics);
}

// ★ 結果画面: 歌詞選択UI付き ★
function showResultOverlay(currentCanvas, titleText, originalSourceCanvas, currentLyrics) {
    const old = document.getElementById('shot-result-overlay');
    if(old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'shot-result-overlay';
    const root = document.getElementById('mv-root-container') || document.body;
    
    Object.assign(overlay.style, {
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.9)', zIndex: 100000, 
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(8px)', padding: '20px', boxSizing: 'border-box'
    });

    const contentContainer = document.createElement('div');
    Object.assign(contentContainer.style, {
        display: 'flex', gap: '30px', maxWidth: '90%', maxHeight: '85vh',
        alignItems: 'flex-start'
    });

    // 左カラム
    const leftCol = document.createElement('div');
    leftCol.style.flex = '2';
    leftCol.style.display = 'flex'; leftCol.style.flexDirection = 'column'; leftCol.style.alignItems = 'center';

    const img = document.createElement('img');
    img.src = currentCanvas.toDataURL('image/jpeg', 0.9);
    Object.assign(img.style, {
        maxWidth: '100%', maxHeight: '70vh', 
        borderRadius: '8px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        marginBottom: '20px'
    });
    leftCol.appendChild(img);

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex'; btnRow.style.gap = '15px';

    const closeBtn = document.createElement('button');
    closeBtn.innerText = "閉じる";
    // ★統一: mv-glass-btn
    closeBtn.className = "mv-glass-btn";
    closeBtn.onclick = () => overlay.remove();

    const copyBtn = document.createElement('button');
    copyBtn.innerText = "画像をコピーしてXで共有";
    // ★統一: mv-glass-btn
    copyBtn.className = "mv-glass-btn";
    copyBtn.onclick = () => {
        currentCanvas.toBlob(blob => {
            const item = new ClipboardItem({ "image/png": blob });
            navigator.clipboard.write([item]).then(() => {
                let text = `🎵 ${titleText}`;
                if(currentLyrics.length > 0) {
                    text += `\n\n"${currentLyrics.join('\n')}"\n`;
                }
                text += `\n#YTImmersion `;
                const encodedText = encodeURIComponent(text);
                if(confirm("コピーしました！Xを開きますか？")) {
                    window.open(`https://twitter.com/intent/tweet?text=${encodedText}`, '_blank');
                }
            });
        });
    };
    btnRow.appendChild(closeBtn);
    btnRow.appendChild(copyBtn);
    leftCol.appendChild(btnRow);

    // 右カラム
    const rightCol = document.createElement('div');
    rightCol.className = 'lyric-selection-container';
    
    const header = document.createElement('div');
    header.className = 'lyric-selection-header';
    header.innerText = "歌詞をトッピング (最大3行)";
    rightCol.appendChild(header);

    let selectedLines = [...currentLyrics];

    if (lyricsData.length > 0) {
        lyricsData.forEach(line => {
            if (!line.text) return;
            const item = document.createElement('div');
            item.className = 'lyric-select-item';
            item.innerText = line.text;
            if (selectedLines.includes(line.text)) item.classList.add('selected');

            item.onclick = () => {
                if (item.classList.contains('selected')) {
                    item.classList.remove('selected');
                    selectedLines = selectedLines.filter(t => t !== line.text);
                } else {
                    if (selectedLines.length < 3) {
                        item.classList.add('selected');
                        selectedLines.push(line.text);
                    } else {
                        alert("選択できるのは3行までです");
                    }
                }
            };
            rightCol.appendChild(item);
        });
    } else {
        const noLyric = document.createElement('div');
        noLyric.style.color = '#aaa'; noLyric.innerText = "歌詞情報がありません";
        rightCol.appendChild(noLyric);
    }

    const updateBtn = document.createElement('button');
    updateBtn.innerText = "画像を更新 🔄";
    // ★統一: mv-glass-btn
    updateBtn.className = "mv-glass-btn";
    updateBtn.style.width = '100%'; updateBtn.style.marginTop = '15px';
    updateBtn.onclick = () => {
        generateAndShare(originalSourceCanvas, selectedLines);
    };
    rightCol.appendChild(updateBtn);

    contentContainer.appendChild(leftCol);
    if (lyricsData.length > 0) contentContainer.appendChild(rightCol);
    overlay.appendChild(contentContainer);
    root.appendChild(overlay);
}