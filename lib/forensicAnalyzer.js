/**
 * Forensic Accounting Analyzer
 * Provides comprehensive audit log analysis and fraud detection
 */

class ForensicAnalyzer {
  constructor() {
    this.suspiciousPatterns = [];
  }

  /**
   * Analyze transactions for duplicate entries
   */
  detectDuplicateTransactions(transactions) {
    const duplicates = [];
    const seen = new Map();

    transactions.forEach((txn, idx) => {
      const key = `${txn.TxnDate}_${txn.TotalAmt}_${txn.Line?.[0]?.Description || ''}`;
      
      if (seen.has(key)) {
        duplicates.push({
          original: seen.get(key),
          duplicate: txn,
          suspicionLevel: 'HIGH',
          reason: 'Identical amount, date, and description'
        });
      } else {
        seen.set(key, txn);
      }
    });

    return duplicates;
  }

  /**
   * Detect anomalous transactions based on statistical analysis
   */
  detectAnomalies(transactions) {
    const anomalies = [];
    
    // Calculate mean and standard deviation
    const amounts = transactions.map(t => parseFloat(t.TotalAmt || 0));
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((sum, amt) => sum + Math.pow(amt - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    // Flag transactions beyond 3 standard deviations
    transactions.forEach(txn => {
      const amount = parseFloat(txn.TotalAmt || 0);
      const zScore = Math.abs((amount - mean) / stdDev);
      
      if (zScore > 3) {
        anomalies.push({
          transaction: txn,
          zScore: zScore.toFixed(2),
          suspicionLevel: zScore > 4 ? 'CRITICAL' : 'HIGH',
          reason: `Amount ${amount} is ${zScore.toFixed(2)} standard deviations from mean`
        });
      }
    });

    return anomalies;
  }

  /**
   * Analyze transaction patterns for unusual behavior
   */
  analyzeTransactionPatterns(transactions) {
    const patterns = {
      roundNumberTransactions: [],
      weekendTransactions: [],
      afterHoursTransactions: [],
      rapidFireTransactions: []
    };

    // Detect round number transactions (potential fraud indicator)
    transactions.forEach(txn => {
      const amount = parseFloat(txn.TotalAmt || 0);
      if (amount > 0 && amount % 100 === 0 && amount >= 500) {
        patterns.roundNumberTransactions.push({
          transaction: txn,
          suspicionLevel: 'MEDIUM',
          reason: 'Large round number amount'
        });
      }
    });

    // Detect weekend transactions
    transactions.forEach(txn => {
      const date = new Date(txn.TxnDate);
      const day = date.getDay();
      if (day === 0 || day === 6) {
        patterns.weekendTransactions.push({
          transaction: txn,
          suspicionLevel: 'LOW',
          reason: 'Transaction on weekend'
        });
      }
    });

    // Detect rapid-fire transactions (multiple in short time)
    const sortedByTime = [...transactions].sort((a, b) => 
      new Date(a.MetaData?.CreateTime || a.TxnDate) - new Date(b.MetaData?.CreateTime || b.TxnDate)
    );

    for (let i = 1; i < sortedByTime.length; i++) {
      const prevTime = new Date(sortedByTime[i-1].MetaData?.CreateTime || sortedByTime[i-1].TxnDate);
      const currTime = new Date(sortedByTime[i].MetaData?.CreateTime || sortedByTime[i].TxnDate);
      const timeDiff = (currTime - prevTime) / 1000; // seconds

      if (timeDiff < 60 && timeDiff > 0) {
        patterns.rapidFireTransactions.push({
          transactions: [sortedByTime[i-1], sortedByTime[i]],
          timeDiff: timeDiff,
          suspicionLevel: 'MEDIUM',
          reason: `Transactions created ${timeDiff.toFixed(0)} seconds apart`
        });
      }
    }

    return patterns;
  }

  /**
   * Generate compliance report (SOX, GAAP)
   */
  generateComplianceReport(data) {
    const report = {
      timestamp: new Date().toISOString(),
      standards: ['SOX', 'GAAP'],
      findings: [],
      recommendations: []
    };

    // Check for segregation of duties
    const creators = new Set();
    const modifiers = new Set();
    
    data.forEach(item => {
      if (item.MetaData) {
        creators.add(item.MetaData.CreateTime);
        if (item.MetaData.LastUpdatedTime !== item.MetaData.CreateTime) {
          modifiers.add(item.MetaData.LastUpdatedTime);
        }
      }
    });

    if (creators.size < 2) {
      report.findings.push({
        severity: 'HIGH',
        category: 'Segregation of Duties',
        issue: 'Limited number of transaction creators detected',
        recommendation: 'Implement proper segregation of duties with multiple authorized personnel'
      });
    }

    // Check for audit trail completeness
    const missingAuditTrail = data.filter(item => !item.MetaData || !item.MetaData.CreateTime);
    if (missingAuditTrail.length > 0) {
      report.findings.push({
        severity: 'CRITICAL',
        category: 'Audit Trail',
        issue: `${missingAuditTrail.length} transactions missing complete audit trail`,
        recommendation: 'Ensure all transactions maintain complete metadata for audit purposes'
      });
    }

    return report;
  }

  /**
   * Detect potential fraud indicators
   */
  detectFraudIndicators(transactions, vendors = [], customers = []) {
    const indicators = {
      ghostVendors: [],
      duplicatePayments: [],
      unusualRefunds: [],
      vendorRotation: []
    };

    // Detect ghost vendors (vendors with PO Box only, no phone)
    vendors.forEach(vendor => {
      if (vendor.PrimaryAddr?.Line1?.includes('PO Box') && !vendor.PrimaryPhone) {
        indicators.ghostVendors.push({
          vendor: vendor,
          suspicionLevel: 'MEDIUM',
          reason: 'Vendor has PO Box address and no phone number'
        });
      }
    });

    // Detect unusual refund patterns
    const refunds = transactions.filter(t => parseFloat(t.TotalAmt || 0) < 0);
    const refundTotal = refunds.reduce((sum, r) => sum + Math.abs(parseFloat(r.TotalAmt || 0)), 0);
    const transactionTotal = transactions.reduce((sum, t) => sum + Math.abs(parseFloat(t.TotalAmt || 0)), 0);
    
    if (refundTotal / transactionTotal > 0.15) {
      indicators.unusualRefunds.push({
        suspicionLevel: 'HIGH',
        refundRatio: (refundTotal / transactionTotal).toFixed(2),
        reason: 'Unusually high ratio of refunds to total transactions'
      });
    }

    // Detect vendor rotation schemes (similar amounts to different vendors)
    const vendorPayments = new Map();
    transactions.forEach(txn => {
      const vendorRef = txn.EntityRef?.value;
      if (vendorRef) {
        if (!vendorPayments.has(vendorRef)) {
          vendorPayments.set(vendorRef, []);
        }
        vendorPayments.get(vendorRef).push(parseFloat(txn.TotalAmt || 0));
      }
    });

    // Check for similar amounts across vendors
    const amounts = Array.from(vendorPayments.values()).flat();
    const amountGroups = new Map();
    amounts.forEach(amt => {
      const rounded = Math.round(amt / 100) * 100;
      if (!amountGroups.has(rounded)) {
        amountGroups.set(rounded, 0);
      }
      amountGroups.set(rounded, amountGroups.get(rounded) + 1);
    });

    amountGroups.forEach((count, amount) => {
      if (count >= 3 && amount > 500) {
        indicators.vendorRotation.push({
          amount: amount,
          occurrences: count,
          suspicionLevel: 'MEDIUM',
          reason: `Similar amount (${amount}) paid to multiple vendors`
        });
      }
    });

    return indicators;
  }

  /**
   * Generate audit trail report
   */
  generateAuditTrail(transactions) {
    const trail = transactions.map(txn => ({
      id: txn.Id,
      type: txn.type || txn.TxnType,
      date: txn.TxnDate,
      amount: txn.TotalAmt,
      created: txn.MetaData?.CreateTime,
      lastModified: txn.MetaData?.LastUpdatedTime,
      modifiedCount: txn.MetaData?.LastUpdatedTime !== txn.MetaData?.CreateTime ? 1 : 0,
      entity: txn.EntityRef?.name || 'N/A'
    }));

    return {
      totalTransactions: trail.length,
      modifiedTransactions: trail.filter(t => t.modifiedCount > 0).length,
      trail: trail
    };
  }

  /**
   * Calculate financial health score
   */
  calculateFinancialHealthScore(financialData) {
    let score = 100;
    const factors = [];

    // Analyze cash flow
    if (financialData.cashFlow) {
      if (financialData.cashFlow < 0) {
        score -= 20;
        factors.push({ factor: 'Negative cash flow', impact: -20 });
      }
    }

    // Analyze debt ratio
    if (financialData.totalLiabilities && financialData.totalAssets) {
      const debtRatio = financialData.totalLiabilities / financialData.totalAssets;
      if (debtRatio > 0.6) {
        score -= 15;
        factors.push({ factor: 'High debt ratio', impact: -15 });
      }
    }

    // Analyze quick ratio (liquidity)
    if (financialData.currentAssets && financialData.currentLiabilities) {
      const quickRatio = financialData.currentAssets / financialData.currentLiabilities;
      if (quickRatio < 1) {
        score -= 10;
        factors.push({ factor: 'Low liquidity', impact: -10 });
      }
    }

    return {
      score: Math.max(0, score),
      grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D',
      factors: factors
    };
  }
}

module.exports = ForensicAnalyzer;
