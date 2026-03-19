// UI Manipulation and Data Visualization

const UI = {
    init() {
        // Initialization handled
    },

    // Called once during app init — builds the digit row cards
    initDigitCircle() {
        const container = document.getElementById('digit-circle');
        if (!container) return;
        container.innerHTML = ''; // clear any stale content

        for (let i = 0; i <= 9; i++) {
            const card = document.createElement('div');
            card.classList.add('digit-node');
            card.id = `digit-node-${i}`;
            card.innerHTML = `<span class="dn-digit">${i}</span><span class="dn-pct">0%</span>`;
            container.appendChild(card);
        }
    },

    // Called every tick — updates frequencies, highlights, and bars
    updateDigitCircle(history, lastDigit) {
        if (!history || history.length < 2) return;
        
        const counts = Array(10).fill(0);
        history.forEach(t => {
            const str = t.quote.toString();
            const d = parseInt(str[str.length - 1]);
            if (!isNaN(d)) counts[d]++;
        });

        const total = history.length || 1;
        const hotDigit  = counts.indexOf(Math.max(...counts));
        const coldDigit = counts.indexOf(Math.min(...counts));

        for (let i = 0; i <= 9; i++) {
            const node = document.getElementById(`digit-node-${i}`);
            if (!node) continue;
            
            const pct = Math.round((counts[i] / total) * 100);
            node.innerHTML = `<span class="dn-digit">${i}</span><span class="dn-pct">${pct}%</span>`;
            
            node.classList.remove('hot', 'cold', 'active-digit');
            if (i === lastDigit)       node.classList.add('active-digit');
            else if (i === hotDigit)  node.classList.add('hot');
            else if (i === coldDigit) node.classList.add('cold');
        }
    },

    updateConnectionStatus(status) {
        const dot = document.getElementById('connection-dot');
        const text = document.getElementById('connection-status');
        
        dot.className = `dot ${status}`;
        text.textContent = status === 'connected' ? 'Live Data' : 'Connecting...';
    },

    updateMarketTitle(title) {
        document.getElementById('current-market-title').textContent = title + " Detail";
    },

    updateLivePrice(quote, direction) {
        const priceEl = document.getElementById('live-price');
        const dirEl = document.getElementById('price-direction');
        
        // Format to min 3 decimal places depending on quote length
        // We'll keep it simple and preserve exact quote digits mostly, but pad if needed
        let formattedStr = quote.toString();
        if(!formattedStr.includes('.')) formattedStr += '.000';
        
        priceEl.textContent = formattedStr;
        
        priceEl.className = `price-display ${direction}`;
        
        if (direction === 'up') dirEl.textContent = '▲';
        else if (direction === 'down') dirEl.textContent = '▼';
        else dirEl.textContent = '-';
        
        dirEl.className = `direction ${direction === 'neutral' ? '' : (direction === 'up' ? 'text-success' : 'text-danger')}`;
        // Note: text-success/text-danger are helper classes we could add, or just let CSS handle it if we want it isolated
        dirEl.style.color = direction === 'up' ? '#10b981' : (direction === 'down' ? '#ef4444' : '#94a3b8');
    },

    updateTickDots(tick, direction, recentTicks) {
        const container = document.getElementById('tick-history-dots');
        container.innerHTML = ''; // Clear current

        recentTicks.forEach((t, index) => {
            const el = document.createElement('div');
            
            // Determine direction against previous for color
            let dirClass = '';
            if (index > 0) {
                const prev = recentTicks[index-1];
                dirClass = t.quote > prev.quote ? 'up' : (t.quote < prev.quote ? 'down' : '');
            } else {
                dirClass = direction; // Use current tick direction for first unknown dot
            }
            
            el.className = `tick-dot ${dirClass}`;
            if (index === recentTicks.length - 1) {
                el.classList.add('active');
            }
            container.appendChild(el);
        });
    },

    clearData() {
        document.getElementById('tick-history-dots').innerHTML = '';
        this.updateLivePrice(0, 'neutral');
    },

    updatePredictions(predictions) {
        // Predictions object contains specific data for each card type
        this._updatePredictionCard('rf', predictions.riseFall);
        this._updatePredictionCard('ou', predictions.overUnder);
        this._updatePredictionCard('hl', predictions.higherLower);
        this._updatePredictionCard('tt', predictions.touchNoTouch);
        this._updatePredictionCard('eo', predictions.evenOdd);
        
        // Matches / Differs uses different DOM structure
        this._updateMatchesDiffers(predictions.matchesDiffers);
        
        // Accumulators uses different DOM structure
    },

    updateEntryScanner(scannerItems, categoryCode) {
        const container = document.getElementById(`${categoryCode}-scanner-list`);
        if (!container) return;
        
        container.innerHTML = '';
        
        // Filter items only for this specific category (although app.js might pre-filter, it's safer)
        const relevantItems = scannerItems.filter(item => item.categoryCode === categoryCode);
        
        if (relevantItems.length === 0) {
            container.innerHTML = '<div class="empty-scanner">Monitoring selected markets...</div>';
            return;
        }

        relevantItems.forEach(item => {
            const el = document.createElement('div');
            el.className = `scanner-item pulse-animation ${item.type}`; 
            
            const time = new Date(item.epoch * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});

            el.innerHTML = `
                <div class="scanner-header">
                    <span class="scanner-market">${item.marketName}</span>
                    <span class="scanner-time">${time}</span>
                </div>
                <div class="scanner-signal">${item.signalText}</div>
                <div class="scanner-entry">${item.entryText}</div>
            `;
            container.appendChild(el);
        });
    },

    _updatePredictionCard(prefix, data) {
        // We only update confidence bars here now, the signal text logic is moved to the scanner lists
        
        const confEl = document.getElementById(`${prefix}-confidence`);
        confEl.textContent = `${data.confidence}%`;
        
        // Find the fills
        const keys = Object.keys(data.values); // e.g., ['rise', 'fall']
        const fill1 = document.getElementById(`${prefix}-${keys[0]}-fill`);
        const fill2 = document.getElementById(`${prefix}-${keys[1]}-fill`);
        
        if(fill1) fill1.style.width = `${data.values[keys[0]]}%`;
        if(fill2) fill2.style.width = `${data.values[keys[1]]}%`;
    },

    _updateMatchesDiffers(data) {
        const confEl = document.getElementById('md-confidence');
        confEl.textContent = `${data.confidence}%`;

        document.getElementById('hot-digit').textContent = data.hot;
        document.getElementById('cold-digit').textContent = data.cold;
    },

    _updateAccumulators(data) {
        const confEl = document.getElementById('acc-confidence');
        confEl.textContent = `${data.confidence}%`;

        const volFill = document.getElementById('volatility-fill');
        volFill.style.width = `${data.volatility}%`;
        
        // Change color based on volatility
        volFill.className = `progress-fill ${data.volatility > 70 ? 'down' : (data.volatility < 30 ? 'up' : 'neutral')}`;
    },

    showSignalPopup(signal) {
        const popup = document.getElementById('signal-popup');
        if (!popup) return;
        
        // Prevent showing if already visible to avoid overriding, or could allow it
        if (!popup.classList.contains('hidden')) return;
        
        const isBuy = signal.type === 'strong-buy';
        const colorValue = isBuy ? '#10b981' : '#ef4444';
        const glowValue = isBuy ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)';
        
        const titleEl = document.getElementById('popup-title');
        titleEl.textContent = isBuy ? '🔥 STRONG BUY DETECTED' : '🚨 STRONG SELL DETECTED';
        titleEl.style.color = colorValue;
        titleEl.style.textShadow = `0 0 10px ${glowValue}`;
        
        document.getElementById('popup-details').innerHTML = `
            <div class="detail-row"><span class="detail-label">Asset:</span> <span class="detail-value">${signal.marketName}</span></div>
            <div class="detail-row"><span class="detail-label">Trade Type:</span> <span class="detail-value">${signal.category}</span></div>
            <div class="detail-row"><span class="detail-label">Action:</span> <span class="detail-value" style="color:${colorValue}">${signal.signalText}</span></div>
            <div class="detail-row" style="margin-top: 8px; font-size: 0.8rem; color: #a78bfa;">${signal.entryText}</div>
        `;
        
        popup.classList.remove('hidden');
    },

    hideSignalPopup() {
        const popup = document.getElementById('signal-popup');
        if (popup) popup.classList.add('hidden');
    }
};
