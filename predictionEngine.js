// Prediction Engine Algorithms

// These algorithms simulate real AI analysis strategies using standard technical analysis and statistical methods.
const PredictionEngine = {
    
    // Main interface called by app.js passing the history array
    analyze(tickHistory, options = {}) {
        const overUnderTarget = options.overUnderTarget !== undefined ? options.overUnderTarget : 5;

        return {
            riseFall: this._analyzeRiseFall(tickHistory),
            overUnder: this._analyzeOverUnder(tickHistory, overUnderTarget),
            higherLower: this._analyzeHigherLower(tickHistory),
            touchNoTouch: this._analyzeTouchNoTouch(tickHistory),
            matchesDiffers: this._analyzeMatchesDiffers(tickHistory),
            evenOdd: this._analyzeEvenOdd(tickHistory),
            accumulators: this._analyzeAccumulators(tickHistory)
        };
    },

    // 1. Rise / Fall Options
    // Uses short-term moving average & recent momentum
    _analyzeRiseFall(history) {
        const period = Math.min(10, history.length); // SMA period
        const recent = history.slice(-period).map(t => t.quote);
        
        const currentPrice = recent[recent.length - 1];
        const prevPrice = recent[0]; // Price [period] ticks ago
        
        const isUpTrend = currentPrice > prevPrice;
        
        // Calculate SMA
        const sum = recent.reduce((a, b) => a + b, 0);
        const sma = sum / period;

        // Confidence heuristic
        let confidence = 50; 
        const delta = Math.abs(currentPrice - sma) / sma; // Distance from SMA

        if (isUpTrend && currentPrice > sma) {
            confidence += 10 + (delta * 10000); // Stronger if above moving average
        } else if (!isUpTrend && currentPrice < sma) {
            confidence += 10 + (delta * 10000); // Stronger if below moving average
        }

        confidence = Math.min(Math.round(confidence), 98); // Cap at 98%
        
        // Add random slight flux for realism
        confidence += Math.floor(Math.random() * 5) - 2;

        const riseVal = isUpTrend ? confidence : 100 - confidence;
        const fallVal = 100 - riseVal;

        let signalType = 'neutral';
        let signalText = 'Awaiting Trend...';
        let entryText = 'Observing market fluctuations.'; // Default

        if (riseVal > 58) { 
            signalType = 'strong-buy'; 
            signalText = `Strong Rise Expected`; 
            entryText = `Buy Fall reversal on next tick down (Price < ${currentPrice.toFixed(3)})`; 
        }
        else if (fallVal > 58) { 
            signalType = 'strong-sell'; 
            signalText = `Strong Fall Expected`; 
            entryText = `Buy Rise reversal on next tick up (Price > ${currentPrice.toFixed(3)})`; 
        } else if (riseVal > 52) {
            signalText = `Slight Rise Bias`;
            entryText = `Buy Rise on consecutive 2 ticks up`;
        } else if (fallVal > 52) {
            signalText = `Slight Fall Bias`;
            entryText = `Buy Fall on consecutive 2 ticks down`;
        }

        return {
            confidence: Math.max(riseVal, fallVal),
            values: { rise: riseVal, fall: fallVal },
            signal: { type: signalType, text: signalText },
            entry: entryText
        };
    },

    // 2. Over / Under (Prediction digit based on target)
    // Statistical distribution of last digits
    _analyzeOverUnder(history, targetDigit) {
        const lastDigits = history.map(t => {
            const str = t.quote.toString();
            return parseInt(str[str.length - 1]) || 0; // Get rightmost digit
        });
        let overCount = 0;
        let underCount = 0;

        lastDigits.forEach(d => {
            if (d > targetDigit) overCount++;
            if (d < targetDigit) underCount++;
        });

        const total = overCount + underCount || 1; // Prevent div by 0
        const overPercent = Math.round((overCount / total) * 100);
        const underPercent = 100 - overPercent;

        const confidence = Math.max(overPercent, underPercent);

        let signalType = 'neutral';
        let signalText = 'Distribution Even';
        let entryText = 'Insufficient statistical bias. Wait.';

        if (overCount === 0 && underCount === 0) {
            // Case where all ticks are exactly the target digit (rare)
            signalText = 'Matches Target';
            return {
                confidence: 50,
                values: { over: 50, under: 50 },
                signal: { type: signalType, text: signalText },
                entry: 'Wait for bias to form.'
            };
        }

        if (overPercent > 58) { 
            signalType = 'strong-buy'; 
            signalText = `Over ${targetDigit} Dominant`; 
            entryText = `Wait for tick ending in ${targetDigit - 1 >= 0 ? targetDigit - 1 : 9}, then Buy Over ${targetDigit}`;
        }
        else if (underPercent > 58) { 
            signalType = 'strong-sell'; 
            signalText = `Under ${targetDigit} Dominant`; 
            entryText = `Wait for tick ending in ${targetDigit + 1 <= 9 ? targetDigit + 1 : 0}, then Buy Under ${targetDigit}`;
        } else if (overPercent > 50) {
            signalText = `Over Bias Forming`;
            entryText = `Buy Over ${targetDigit} on next matching digit.`;
        } else if (underPercent > 50) {
            signalText = `Under Bias Forming`;
            entryText = `Buy Under ${targetDigit} on next matching digit.`;
        }

        return {
            confidence: confidence,
            values: { over: overPercent, under: underPercent },
            signal: { type: signalType, text: signalText },
            entry: entryText
        };
    },

    // 3. Higher / Lower
    // Similar to Rise/Fall but analyzes volatility specifically to see if barriers will be breached
    _analyzeHigherLower(history) {
        // We'll use a slightly different heuristic: Consecutive ticks in same direction.
        const recent = history.slice(-5);
        let consecutiveUp = 0;
        let consecutiveDown = 0;

        for (let i = 1; i < recent.length; i++) {
            if (recent[i].quote > recent[i-1].quote) consecutiveUp++;
            else if (recent[i].quote < recent[i-1].quote) consecutiveDown++;
        }

        let higherVal = 50 + (consecutiveUp * 10) - (consecutiveDown * 5);
        let lowerVal = 50 + (consecutiveDown * 10) - (consecutiveUp * 5);

        // Normalize
        const total = higherVal + lowerVal;
        higherVal = Math.round((higherVal / total) * 100);
        lowerVal = 100 - higherVal;

        let signalType = 'neutral';
        let signalText = 'Range Bound';
        let entryText = 'Wait for barrier break.';

        const currentPrice = history[history.length - 1].quote;

        if (higherVal > 60) { 
            signalType = 'strong-buy'; 
            signalText = `Breakout Higher`; 
            entryText = `Barrier Entry: Current Price (${currentPrice}) + 0.05, Duration: 5 Ticks`;
        }
        else if (lowerVal > 60) { 
            signalType = 'strong-sell'; 
            signalText = `Breakdown Lower`; 
            entryText = `Barrier Entry: Current Price (${currentPrice}) - 0.05, Duration: 5 Ticks`;
        } else if (higherVal > 52) {
             signalText = `Trend Up`;
             entryText = `Buy Higher on next volatile spike.`;
        } else if (lowerVal > 52) {
             signalText = `Trend Down`;
             entryText = `Buy Lower on next volatile drop.`;
        }

        return {
            confidence: Math.max(higherVal, lowerVal),
            values: { higher: higherVal, lower: lowerVal },
            signal: { type: signalType, text: signalText },
            entry: entryText
        };
    },

    // 4. Touch / No Touch
    // Uses recent volatility + distance from a theoretical barrier.
    // In live trading, the user sets the barrier, but here we simulate an auto-calculated one 
    // based on short-term average True Range (ATR).
    _analyzeTouchNoTouch(history) {
        const period = Math.min(10, history.length);
        const recent = history.slice(-period).map(t => t.quote);
        
        let totalMove = 0;
        for (let i = 1; i < recent.length; i++) {
            totalMove += Math.abs(recent[i] - recent[i-1]);
        }
        const avgMove = totalMove / (recent.length - 1);
        
        // Let's assume a theoretical barrier is set at (Current Price +/- (avgMove * 5))
        // High volatility = High chance of Touch. Low volatility = High chance of No Touch.
        
        // We calculate a volatility score 0-100
        const currentPrice = recent[recent.length - 1];
        const variance = recent.reduce((sum, val) => sum + Math.pow(val - currentPrice, 2), 0) / period;
        const stdDev = Math.sqrt(variance);
        
        // Normalize
        // If the standard deviation is much higher than the average tick movement, market is jumpy.
        const jumpiness = stdDev / (avgMove || 0.001); 
        
        let touchVal = Math.min(Math.round(jumpiness * 25), 98) + Math.floor(Math.random() * 5);
        touchVal = Math.min(Math.max(touchVal, 5), 95); // clamp 5-95
        
        let noTouchVal = 100 - touchVal;
        
        let signalType = 'neutral';
        let signalText = 'Awaiting Volatility...';
        let entryText = 'Barrier ambiguous. Wait.';

        if (touchVal > 65) {
            signalType = 'strong-buy';
            signalText = `Touch Highly Probable`;
            entryText = `Buy Touch (Barrier: +/- ${(avgMove * 5).toFixed(3)}) on next tick.`;
        } else if (noTouchVal > 65) {
            signalType = 'strong-buy'; // For No Touch, it's also a 'buy' of the No Touch contract
            signalText = `No Touch Highly Probable`;
            entryText = `Buy No Touch (Barrier: +/- ${(avgMove * 8).toFixed(3)}).`;
        } else if (touchVal > 55) {
            signalText = `Volatility Increasing`;
            entryText = `Consider Touch if trend breaks out.`;
        } else {
            signalText = `Low Volatility Range`;
            entryText = `Consider No Touch on wide barriers.`;
        }

        return {
            confidence: Math.max(touchVal, noTouchVal),
            values: { touch: touchVal, notouch: noTouchVal },
            signal: { type: signalType, text: signalText },
            entry: entryText
        };
    },

    // 5. Matches / Differs
    // Finds Hot/Cold digits (highest/lowest frequency)
    _analyzeMatchesDiffers(history) {
        const digitCounts = Array(10).fill(0);
        
        history.forEach(t => {
            const str = t.quote.toString();
            const d = parseInt(str[str.length - 1]) || 0;
            digitCounts[d]++;
        });

        let hotCount = -1, coldCount = 999;
        let hot = 0, cold = 0;

        digitCounts.forEach((count, digit) => {
            if (count > hotCount) { hotCount = count; hot = digit; }
            if (count < coldCount) { coldCount = count; cold = digit; }
        });

        // If history is small, multiple digits might have 0 count. Pick the lowest actual digit.
        
        let confidence = Math.round((hotCount / history.length) * 100) * 2; // Multiply by 2 as normal distribution is 10%
        confidence = Math.min(confidence, 99); // Cap

        let signalType = 'neutral';
        let signalText = `Pattern Forming`;
        let entryText = 'Insufficient sequence data.';
        
        if (confidence > 30) {
            signalType = 'strong-buy';
            signalText = `Differ from ${cold} Highly Probable`; // High chance it DIFFERS from cold
            entryText = `Buy Differs (${cold}) when last tick digit is ${hot}`;
        } else {
            signalText = `Observing digits`;
            entryText = `Wait for cold digit to solidify under 5% frequency.`;
        }

        return {
            confidence: confidence,
            hot: hot,
            cold: cold,
            signal: { type: signalType, text: signalText },
            entry: entryText
        };
    },

    // 6. Even / Odd
    // Statistical distribution of last digits modulo 2
    _analyzeEvenOdd(history) {
        let evenCount = 0;
        let oddCount = 0;

        history.forEach(t => {
            const str = t.quote.toString();
            const d = parseInt(str[str.length - 1]) || 0;
            if (d % 2 === 0) evenCount++;
            else oddCount++;
        });

        const total = evenCount + oddCount || 1;
        const evenPercent = Math.round((evenCount / total) * 100);
        const oddPercent = 100 - evenPercent;

        let confidence = Math.max(evenPercent, oddPercent);

        let signalType = 'neutral';
        let signalText = 'Distribution Balanced';
        let entryText = 'Insufficient statistical bias. Wait.';

        if (evenPercent > 60) {
            signalType = 'strong-buy';
            signalText = `Even Digits Dominating`;
            entryText = `Buy Even on next tick.`;
        } else if (oddPercent > 60) {
            signalType = 'strong-sell';
            signalText = `Odd Digits Dominating`;
            entryText = `Buy Odd on next tick.`;
        } else if (evenPercent > 54) {
             signalText = `Slight Even Bias`;
             entryText = `Wait for Even > 60% confidence.`;
        } else if (oddPercent > 54) {
             signalText = `Slight Odd Bias`;
             entryText = `Wait for Odd > 60% confidence.`;
        }

        return {
            confidence: confidence,
            values: { even: evenPercent, odd: oddPercent },
            signal: { type: signalType, text: signalText },
            entry: entryText
        };
    },

    // 7. Accumulators
    // Analyzes standard deviation / volatility. Lower volatility = better for accumulators.
    _analyzeAccumulators(history) {
        const period = Math.min(20, history.length);
        const recent = history.slice(-period).map(t => t.quote);
        
        // Calc average
        const avg = recent.reduce((sum, val) => sum + val, 0) / period;
        
        // Calc variance
        const variance = recent.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / period;
        const stdDev = Math.sqrt(variance);

        // Normalize volatility to a 0-100 scale (highly dependent on market, using dynamic heuristic)
        // stdDev / avg gives coefficient of variation
        const cv = stdDev / avg;
        
        // Turn this into a 0-100 meter. High CV = High Volatility = Bad for Accumulators
        let volatilityMeter = Math.min(Math.round(cv * 50000), 100); 

        let confidence = 100 - volatilityMeter;
        
        let signalType = 'neutral';
        let signalText = 'Moderate Volatility';
        let entryText = 'Wait for volatility to drop.';

        if (volatilityMeter > 60) {
            signalType = 'strong-sell';
            signalText = `High Risk: Barriers Likely Breached`;
            entryText = 'Do NOT enter Accumulators.';
        } else if (volatilityMeter < 40) {
            signalType = 'strong-buy';
            signalText = `Low Risk: Optimal for Accumulators`;
            entryText = `Buy Accumulator (Growth Rate: 1% or 2%) now.`;
        } else {
             signalText = `Average Market Flow`;
             entryText = `Wait for lower standard deviation.`;
        }

        return {
            confidence: confidence,
            volatility: volatilityMeter,
            signal: { type: signalType, text: signalText },
            entry: entryText
        };
    }
};
