let peer = null;
let conn = null;
let msgQueue = []; 

const peerConfig = {
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' }
        ]
    }
};

if (typeof Peer !== 'undefined') {
    peer = new Peer(peerConfig);

    peer.on('open', (id) => {
        window.parent.postMessage({ type: 'PEER_OPEN', id: id }, '*');
    });

    peer.on('connection', (c) => {
        conn = c;
        console.log("Bridge: Connection received");

     
        conn.on('open', () => {
            console.log("Bridge: Connection OPEN!");
            window.parent.postMessage({ type: 'PEER_CONNECTED' }, '*');
            
           
            while (msgQueue.length > 0) {
                const payload = msgQueue.shift();
                try {
                    conn.send(payload);
                } catch(e) { console.error("Queue send error:", e); }
            }
        });

        conn.on('data', (data) => {
            window.parent.postMessage({ type: 'REMOTE_COMMAND', data: data }, '*');
        });

        conn.on('close', () => {
             console.log("Bridge: Connection closed");
             window.parent.postMessage({ type: 'PEER_DISCONNECTED' }, '*');
        });
        
        conn.on('error', (err) => {
            console.error("Bridge Connection Error:", err);
        });
    });
}

// content.js からのデータ送信要求を受け取る
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SEND_TO_PEER') {
        const payload = event.data.payload;
        
        if (conn && conn.open) {
            // 接続済みなら即送信
            try {
                conn.send(payload);
            } catch(e) {
                console.error("Bridge Send Error:", e);
            }
        } else {
            // 未接続または準備中ならキューに貯める
            console.log("Bridge: Buffering message...");
            msgQueue.push(payload);
        }
    }
});