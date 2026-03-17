// Core Application Logic & State Management

const APP_ID = 1089;
const WS_URL = `wss://ws.binaryws.com/websockets/v3?app_id=${APP_ID}`;

const state = {
    ws: null,
    activeDetailMarket: 'R_10', // The market currently being viewed in detail
    selectedMarkets: ['R_10'], // The markets currently being scanned
    marketHistories: { // Stores recent tick objects per market { epoch, quote }
        'R_10': []
    }, 
    maxHistorySize: 100,
    isConnected: false,
    overUnderTarget: 5, // Default digit for Over/Under prediction
    scannerSignals: [], // Active signals for all categories
    activeCategoryFilter: 'rf' // Defaults to Rise / Fall
};

const marketNames = {
    'R_10': 'Volatility 10 Index',
    '1HZ10V': 'Volatility 10 (1s) Index',
    'R_25': 'Volatility 25 Index',
    '1HZ25V': 'Volatility 25 (1s) Index',
    'R_50': 'Volatility 50 Index',
    '1HZ50V': 'Volatility 50 (1s) Index',
    'R_75': 'Volatility 75 Index',
    '1HZ75V': 'Volatility 75 (1s) Index',
    'R_100': 'Volatility 100 Index',
    '1HZ100V': 'Volatility 100 (1s) Index'
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize UI & Chart
    UI.init();
    UI.initDigitCircle();

    // 2. Connect to Deriv WebSocket
    connectWebSocket();

    // 3. Setup Event Listeners
    setupEventListeners();
});

function connectWebSocket() {
    UI.updateConnectionStatus('connecting');

    state.ws = new WebSocket(WS_URL);

    state.ws.onopen = () => {
        state.isConnected = true;
        UI.updateConnectionStatus('connected');

        // Subscribe to default markets
        subscribeToMarkets(state.selectedMarkets);
    };

    state.ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        handleMessage(data);
    };

    state.ws.onclose = () => {
        state.isConnected = false;
        UI.updateConnectionStatus('disconnected');
        // Reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
    };

    state.ws.onerror = (err) => {
        console.error("WebSocket Error: ", err);
    };
}

function handleMessage(data) {
    if (data.msg_type === 'tick') {
        const tick = data.tick;
        processNewTick({
            symbol: tick.symbol,
            epoch: tick.epoch,
            quote: parseFloat(tick.quote)
        });
    } else if (data.msg_type === 'history') {
        // Handle initial history payload if needed
    } else if (data.msg_type === 'forget_all') {
        // Acknowledged forget_all
    }
}

function processNewTick(tick) {
    const symbol = tick.symbol;
    
    // Initialize history array if it doesn't exist
    if (!state.marketHistories[symbol]) {
        state.marketHistories[symbol] = [];
    }
    
    const history = state.marketHistories[symbol];
    
    // 1. Update State History
    history.push({ epoch: tick.epoch, quote: parseFloat(tick.quote) });
    if (history.length > state.maxHistorySize) {
        history.shift(); // Remove oldest
    }

    // Need at least 2 ticks to determine direction
    let direction = 'neutral';
    if (history.length > 1) {
        const prevTick = history[history.length - 2];
        direction = tick.quote > prevTick.quote ? 'up' : (tick.quote < prevTick.quote ? 'down' : 'neutral');
        
        // 2. Trigger Prediction Engine & Scanner
        if (history.length >= 10) { 
            const predictions = PredictionEngine.analyze(history, {
                overUnderTarget: state.overUnderTarget
            });
            
            // Check for strong signals for the Entry Scanner
            checkAndAddScannerSignals(symbol, predictions, tick.epoch);
            
            // If this is the currently viewed market in detail, update the UI
            if (symbol === state.activeDetailMarket) {
                UI.updateLivePrice(parseFloat(tick.quote), direction);
                UI.updateTickDots({ quote: parseFloat(tick.quote) }, direction, history.slice(-10));
                UI.updatePredictions(predictions);
                
                // Digit Circle Analysis — extract last digit of the price
                const priceStr = tick.quote.toString();
                const lastDigit = parseInt(priceStr[priceStr.length - 1]) || 0;
                UI.updateDigitCircle(history, lastDigit);
            }
        }
    } 
    
    if (symbol === state.activeDetailMarket && history.length < 10) {
        UI.updateLivePrice(parseFloat(tick.quote), direction);
    }
}

function checkAndAddScannerSignals(symbol, predictions, currentEpoch) {
    let newSignalsFound = false;
    
    // Helper to evaluate a prediction category
    const evaluatePrediction = (predData, categoryName, categoryCode) => {
        if (predData.signal.type === 'strong-buy' || predData.signal.type === 'strong-sell') {
            // Check if we already have a recent signal for this market and category to prevent spam
            const existingIdx = state.scannerSignals.findIndex(s => s.market === symbol && s.categoryCode === categoryCode);
            
            const newSignal = {
                market: symbol,
                marketName: marketNames[symbol],
                category: categoryName,
                categoryCode: categoryCode,
                type: predData.signal.type,
                signalText: predData.signal.text,
                entryText: predData.entry,
                epoch: currentEpoch
            };
            
            if (existingIdx !== -1) {
                // Update existing if it's been more than a few ticks or signal changed
                state.scannerSignals[existingIdx] = newSignal;
            } else {
                // Add new
                state.scannerSignals.unshift(newSignal); // Add to beginning
                newSignalsFound = true;
            }
        }
    };

    evaluatePrediction(predictions.riseFall, 'Rise / Fall', 'rf');
    evaluatePrediction(predictions.overUnder, 'Over / Under', 'ou');
    evaluatePrediction(predictions.higherLower, 'Higher / Lower', 'hl');
    evaluatePrediction(predictions.touchNoTouch, 'Touch / No Touch', 'tt');
    evaluatePrediction(predictions.matchesDiffers, 'Matches / Differs', 'md');
    evaluatePrediction(predictions.evenOdd, 'Even / Odd', 'eo');
    evaluatePrediction(predictions.accumulators, 'Accumulators', 'acc');
    
    // Keep only the most recent 50 signals overall in memory
    if (state.scannerSignals.length > 50) {
        state.scannerSignals = state.scannerSignals.slice(0, 50);
    }
    
    // Filter signals passed to UI based on active category
    const visibleSignals = state.scannerSignals.filter(s => s.categoryCode === state.activeCategoryFilter);
    UI.updateEntryScanner(visibleSignals, state.activeCategoryFilter);
}

function subscribeToMarkets(marketSymbols) {
    if (!state.isConnected) return;

    // First unsubscribe from all previous tick streams
    state.ws.send(JSON.stringify({
        forget_all: "ticks"
    }));

    // Clear old signals for markets we are no longer subscribed to
    state.scannerSignals = state.scannerSignals.filter(s => marketSymbols.includes(s.market));
    const visibleSignals = state.scannerSignals.filter(s => s.categoryCode === state.activeCategoryFilter);
    UI.updateEntryScanner(visibleSignals, state.activeCategoryFilter);

    setTimeout(() => {
        marketSymbols.forEach(symbol => {
            state.ws.send(JSON.stringify({
                ticks: symbol,
                subscribe: 1
            }));
        });
    }, 200);
}

function updateDetailSelectorDropdown() {
    const selector = document.getElementById('active-detail-selector');
    if (!selector) return;
    
    selector.innerHTML = '';
    state.selectedMarkets.forEach(symbol => {
        const option = document.createElement('option');
        option.value = symbol;
        option.textContent = marketNames[symbol];
        // Ensure active detail market is one of the selected ones
        if (symbol === state.activeDetailMarket) {
            option.selected = true;
        }
        selector.appendChild(option);
    });
    
    // If active detail market is no longer in selected markets, default to the first one available
    if (state.selectedMarkets.length > 0 && !state.selectedMarkets.includes(state.activeDetailMarket)) {
        state.activeDetailMarket = state.selectedMarkets[0];
        UI.updateMarketTitle(marketNames[state.activeDetailMarket]);
        selector.value = state.activeDetailMarket;
        UI.clearData(); // Will repopulate on next tick
    } else if (state.selectedMarkets.length === 0) {
        UI.clearData();
    }
}

function setupEventListeners() {
    // Market Button Toggle Logic
    const marketBtns = document.querySelectorAll('.market-toggle-btn');
    marketBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Toggle active state
            btn.classList.toggle('active');
            
            // Gather all active values
            const selected = Array.from(marketBtns)
                                 .filter(b => b.classList.contains('active'))
                                 .map(b => b.dataset.val);
            
            // Prevent deselecting everything entirely, forces at least 1 market
            if (selected.length === 0) {
                btn.classList.add('active'); // re-activate
                return; // exit early
            }
            
            state.selectedMarkets = selected;
            updateDetailSelectorDropdown();
            subscribeToMarkets(selected);
        });
    });

    // Detail View Selector logic
    const detailSelector = document.getElementById('active-detail-selector');
    if (detailSelector) {
        detailSelector.addEventListener('change', (e) => {
            state.activeDetailMarket = e.target.value;
            const selectedText = e.target.options[e.target.selectedIndex]?.text || '';
            UI.updateMarketTitle(selectedText);
            
            // Re-render UI immediately if we have history
            const history = state.marketHistories[state.activeDetailMarket] || [];
            if (history.length >= 10) {
                const predictions = PredictionEngine.analyze(history, {
                    overUnderTarget: state.overUnderTarget
                });
                UI.updatePredictions(predictions);
            } else {
                UI.clearData();
            }
        });
    }

    // Over/Under Direct Digit Buttons
    const digitButtons = document.querySelectorAll('.digit-btn');
    if (digitButtons.length > 0) {
        digitButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Update active class
                digitButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                state.overUnderTarget = parseInt(btn.dataset.val);
                
                // Re-trigger prediction immediately for the active view if we have enough data
                const history = state.marketHistories[state.activeDetailMarket] || [];
                if (history.length >= 10) {
                    const predictions = PredictionEngine.analyze(history, {
                        overUnderTarget: state.overUnderTarget
                    });
                    UI.updatePredictions(predictions);
                }
            });
        });
    }

    // Category Filter Buttons Logic
    const categoryBtns = document.querySelectorAll('.category-btn');
    const predictionCards = document.querySelectorAll('.prediction-card');
    
    if (categoryBtns.length > 0) {
        categoryBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Update active class
                categoryBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const filter = btn.dataset.filter;
                state.activeCategoryFilter = filter;
                
                // Show/hide prediction cards
                predictionCards.forEach(card => {
                    if (card.dataset.category === filter) {
                        card.classList.remove('hidden');
                    } else {
                        card.classList.add('hidden');
                    }
                });
                
                // Update Entry Scanner List to only show signals for this filter
                const visibleSignals = state.scannerSignals.filter(s => s.categoryCode === filter);
                UI.updateEntryScanner(visibleSignals, filter);
            });
        });
    }
}
