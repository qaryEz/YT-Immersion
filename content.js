document.addEventListener('yt-navigate-finish', onNavigate);
window.addEventListener('load', init);

function init() {
    if (document.querySelector('.ytp-mv-mode-button')) return;
    const controlBar = document.querySelector('.ytp-right-controls');
    if (controlBar) {
        const btn = document.createElement('div');
        btn.className = 'ytp-button ytp-mv-mode-button';
        btn.innerText = 'MVモード';
        btn.onclick = startMVMode;
        controlBar.insertBefore(btn, controlBar.firstChild);
    }
}

// グローバル変数
let originalParent = null;
let originalNextSibling = null;
let targetVideo = null;
let rootContainer = null;
let lyricsData = [];
let idleTimer = null;

// 動画遷移時の処理
async function onNavigate() {
    init(); // ボタンが消えてたら復活

    // MVモード起動中でなければ何もしない
    if (!rootContainer) return;

    // MVモード中ならデータを更新する
    await updateMVContent();
}

async function startMVMode() {
    if (rootContainer) return;

    targetVideo = document.querySelector('video');
    if (!targetVideo) {
        alert("動画が見つかりません。");
        return;
    }

    // 動画移植
    originalParent = targetVideo.parentNode;
    originalNextSibling = targetVideo.nextSibling;

    rootContainer = document.createElement('div');
    rootContainer.id = 'mv-root-container';
    rootContainer.appendChild(targetVideo);

    const overlayContent = document.createElement('div');
    overlayContent.id = 'mv-overlay-content';
    
    // 曲情報エリア（中身は updateMVContent で入れる）
    const infoArea = document.createElement('div');
    infoArea.id = 'mv-info-area';
    overlayContent.appendChild(infoArea);

    // 歌詞エリア
    const lyricsArea = document.createElement('div');
    lyricsArea.id = 'mv-lyrics-area';
    overlayContent.appendChild(lyricsArea);

    // 閉じるボタン
    const closeBtn = document.createElement('button');
    closeBtn.id = 'mv-close-btn';
    closeBtn.innerText = '閉じる';
    closeBtn.onclick = endMVMode;
    overlayContent.appendChild(closeBtn);

    rootContainer.appendChild(overlayContent);
    document.body.appendChild(rootContainer);

    // イベント登録
    targetVideo.addEventListener('timeupdate', syncLyrics);
    document.addEventListener('mousemove', onUserAction);
    document.addEventListener('click', onUserAction);
    onUserAction();

    // 全画面化
    rootContainer.requestFullscreen().catch(err => {});

    // コンテンツ読み込み開始
    await updateMVContent();

    if (targetVideo.paused) targetVideo.play();
}

// 歌詞とメタデータを取得して表示を更新する関数
async function updateMVContent() {
    const infoArea = document.getElementById('mv-info-area');
    const lyricsArea = document.getElementById('mv-lyrics-area');
    
    // 一旦クリア
    if(infoArea) infoArea.innerHTML = '';
    if(lyricsArea) lyricsArea.innerHTML = '<p style="color:#888; text-align:right; font-size:20px; padding:20px;">読み込み中...</p>';
    lyricsData = [];

    // YouTubeのデータ更新を少し待つ（タイトルなどがDOMに反映されるまで）
    await new Promise(r => setTimeout(r, 1500));

    // 1. 歌詞データ取得 (なければ開く)
    let segments = document.querySelectorAll('ytd-transcript-segment-renderer');
    if (segments.length === 0) {
        const buttons = document.querySelectorAll('button');
        let openTranscriptBtn = null;
        for (let btn of buttons) {
            if (btn.innerText.includes('文字起こし') || btn.getAttribute('aria-label')?.includes('文字起こし')) {
                openTranscriptBtn = btn;
                break;
            }
        }
        
        if (openTranscriptBtn) {
            openTranscriptBtn.click();
            // パネルが開くのを待つ
            await new Promise(r => setTimeout(r, 1500));
            segments = document.querySelectorAll('ytd-transcript-segment-renderer');
        }
    }

    // それでもなければ諦める（歌詞なし動画など）
    if (segments.length === 0) {
        if(lyricsArea) lyricsArea.innerHTML = '<p style="color:#888; text-align:right; font-size:20px; padding:20px;">歌詞が見つかりませんでした</p>';
    } else {
        // 文字起こしパネルを閉じる
        const closeTranscriptBtn = document.querySelector('ytd-transcript-renderer button[aria-label="閉じる"]');
        if(closeTranscriptBtn) closeTranscriptBtn.click();

        // パース
        lyricsData = Array.from(segments).map(seg => {
            const timeStr = seg.querySelector('.segment-timestamp').textContent.trim();
            const text = seg.querySelector('.segment-text').textContent.trim();
            const parts = timeStr.split(':').map(Number);
            let seconds = 0;
            if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
            if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            return { time: seconds, text: text, el: null };
        });

        // 歌詞描画
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

    // 2. メタデータ取得 & 整形
    let rawTitle = document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent.trim() || "";
    let songTitle = rawTitle;
    let rawArtist = document.querySelector('ytd-video-owner-renderer ytd-channel-name a')?.textContent.trim() || "";

    // タイトル整形
    const bracketMatch = rawTitle.match(/『(.*?)』/);
    if (bracketMatch) {
        songTitle = bracketMatch[1];
    } else {
        songTitle = songTitle
            .replace(/【.*?】/g, '')
            .replace(/\[.*?\]/g, '')
            .replace(/\(.*?\)/g, '')
            .replace(/Official\s*Music\s*Video/gi, '')
            .replace(/Music\s*Video/gi, '')
            .replace(/MV/gi, '')
            .replace(/full/gi, '')
            .replace(/公式/g, '')
            .replace(/\//g, '')
            .replace(rawArtist, '')
            .trim();
    }

    // アーティスト名整形
    let artistName = rawArtist
        .replace(/公式チャンネル/g, '')
        .replace(/公式/g, '')
        .replace(/Official\s*Channel/gi, '')
        .replace(/Official/gi, '')
        .replace(/Channel/gi, '')
        .trim();

    // 更新
    if(infoArea) {
        infoArea.innerHTML = `<h1 id="mv-song-title">${songTitle}</h1><p id="mv-artist-name">${artistName}</p>`;
    }
}

function endMVMode() {
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => {});
    }

    if (rootContainer) {
        rootContainer.remove();
        rootContainer = null;
    }
    if (targetVideo && originalParent) {
        if (originalNextSibling) {
            originalParent.insertBefore(targetVideo, originalNextSibling);
        } else {
            originalParent.appendChild(targetVideo);
        }
    }
    if (targetVideo) targetVideo.removeEventListener('timeupdate', syncLyrics);
    document.removeEventListener('mousemove', onUserAction);
    document.removeEventListener('click', onUserAction);
    targetVideo = null;
}

function onUserAction() {
    const infoArea = document.getElementById('mv-info-area');
    const closeBtn = document.getElementById('mv-close-btn');
    if(!infoArea) return;
    infoArea.classList.add('visible');
    closeBtn.classList.add('visible');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        infoArea.classList.remove('visible');
        closeBtn.classList.remove('visible');
    }, 3000);
}

function syncLyrics() {
    if(!targetVideo) return;
    const currentTime = targetVideo.currentTime;
    let activeIndex = -1;

    for (let i = 0; i < lyricsData.length; i++) {
        if (lyricsData[i].time <= currentTime) {
            activeIndex = i;
        } else {
            break;
        }
    }

    let isInstrumental = false;
    if (activeIndex !== -1) {
        const currentLine = lyricsData[activeIndex];
        const nextLine = lyricsData[activeIndex + 1];
        const timeSinceStart = currentTime - currentLine.time;
        const timeToNext = nextLine ? (nextLine.time - currentTime) : 0;

        if (timeSinceStart > 5 && timeToNext > 5) {
            isInstrumental = true;
        }
    }

    lyricsData.forEach((line, i) => {
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