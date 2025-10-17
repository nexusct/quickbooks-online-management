/**
 * Analytics Engine
 * Advanced financial analytics and forecasting
 */

class AnalyticsEngine {
  /**
   * Forecast cash flow using linear regression
   */
  forecastCashFlow(historicalData, periods = 3) {
    if (historicalData.length < 2) {
      return { forecast: [], confidence: 0 };
    }

    // Simple linear regression
    const n = historicalData.length;
    const sumX = historicalData.reduce((sum, _, i) => sum + i, 0);
    const sumY = historicalData.reduce((sum, val) => sum + val, 0);
    const sumXY = historicalData.reduce((sum, val, i) => sum + (i * val), 0);
    const sumX2 = historicalData.reduce((sum, _, i) => sum + (i * i), 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const forecast = [];
    for (let i = 0; i < periods; i++) {
      const period = n + i;
      forecast.push({
        period: period,
        value: slope * period + intercept
      });
    }

    // Calculate R-squared for confidence
    const yMean = sumY / n;
    const ssTotal = historicalData.reduce((sum, val) => sum + Math.pow(val - yMean, 2), 0);
    const ssRes = historicalData.reduce((sum, val, i) => {
      const predicted = slope * i + intercept;
      return sum + Math.pow(val - predicted, 2);
    }, 0);
    const rSquared = 1 - (ssRes / ssTotal);

    return {
      forecast: forecast,
      confidence: Math.max(0, Math.min(1, rSquared)),
      slope: slope,
      trend: slope > 0 ? 'IMPROVING' : slope < 0 ? 'DECLINING' : 'STABLE'
    };
  }

  /**
   * Analyze expense categories and trends
   */
  analyzeExpenseCategories(expenses) {
    const categories = new Map();
    
    expenses.forEach(expense => {
      const category = expense.Category || 'Uncategorized';
      const amount = parseFloat(expense.Amount || 0);
      
      if (!categories.has(category)) {
        categories.set(category, {
          total: 0,
          count: 0,
          transactions: []
        });
      }
      
      const cat = categories.get(category);
      cat.total += amount;
      cat.count += 1;
      cat.transactions.push(expense);
    });

    // Calculate percentages and trends
    const totalExpenses = Array.from(categories.values()).reduce((sum, cat) => sum + cat.total, 0);
    
    const analysis = Array.from(categories.entries()).map(([name, data]) => ({
      category: name,
      total: data.total,
      percentage: ((data.total / totalExpenses) * 100).toFixed(2),
      transactionCount: data.count,
      averageTransaction: (data.total / data.count).toFixed(2),
      trend: this.calculateCategoryTrend(data.transactions)
    }));

    return analysis.sort((a, b) => b.total - a.total);
  }

  /**
   * Calculate trend for a category
   */
  calculateCategoryTrend(transactions) {
    if (transactions.length < 2) return 'INSUFFICIENT_DATA';
    
    const sorted = transactions.sort((a, b) => new Date(a.Date) - new Date(b.Date));
    const half = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, half);
    const secondHalf = sorted.slice(half);
    
    const firstAvg = firstHalf.reduce((sum, t) => sum + parseFloat(t.Amount || 0), 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, t) => sum + parseFloat(t.Amount || 0), 0) / secondHalf.length;
    
    const change = ((secondAvg - firstAvg) / firstAvg) * 100;
    
    if (change > 10) return 'INCREASING';
    if (change < -10) return 'DECREASING';
    return 'STABLE';
  }

  /**
   * Analyze vendor payment patterns
   */
  analyzeVendorPatterns(payments) {
    const vendors = new Map();
    
    payments.forEach(payment => {
      const vendorId = payment.VendorRef?.value || 'Unknown';
      const vendorName = payment.VendorRef?.name || 'Unknown';
      
      if (!vendors.has(vendorId)) {
        vendors.set(vendorId, {
          name: vendorName,
          payments: [],
          totalPaid: 0
        });
      }
      
      const vendor = vendors.get(vendorId);
      vendor.payments.push(payment);
      vendor.totalPaid += parseFloat(payment.TotalAmt || 0);
    });

    const analysis = Array.from(vendors.values()).map(vendor => {
      const amounts = vendor.payments.map(p => parseFloat(p.TotalAmt || 0));
      const dates = vendor.payments.map(p => new Date(p.TxnDate));
      
      // Calculate payment frequency
      dates.sort((a, b) => a - b);
      const intervals = [];
      for (let i = 1; i < dates.length; i++) {
        intervals.push((dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24)); // days
      }
      const avgInterval = intervals.length > 0 
        ? intervals.reduce((a, b) => a + b, 0) / intervals.length 
        : 0;

      return {
        vendor: vendor.name,
        totalPaid: vendor.totalPaid.toFixed(2),
        paymentCount: vendor.payments.length,
        averagePayment: (vendor.totalPaid / vendor.payments.length).toFixed(2),
        averageInterval: avgInterval.toFixed(0),
        consistency: this.calculateConsistency(amounts)
      };
    });

    return analysis.sort((a, b) => b.totalPaid - a.totalPaid);
  }

  /**
   * Calculate consistency score for amounts
   */
  calculateConsistency(amounts) {
    if (amounts.length < 2) return 'N/A';
    
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((sum, amt) => sum + Math.pow(amt - mean, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);
    const cv = (stdDev / mean) * 100; // Coefficient of variation
    
    if (cv < 20) return 'HIGH';
    if (cv < 50) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Analyze customer payment behavior
   */
  analyzeCustomerBehavior(invoices, payments) {
    const customers = new Map();
    
    invoices.forEach(invoice => {
      const customerId = invoice.CustomerRef?.value;
      if (!customerId) return;
      
      if (!customers.has(customerId)) {
        customers.set(customerId, {
          name: invoice.CustomerRef?.name,
          invoices: [],
          payments: [],
          totalBilled: 0,
          totalPaid: 0
        });
      }
      
      const customer = customers.get(customerId);
      customer.invoices.push(invoice);
      customer.totalBilled += parseFloat(invoice.TotalAmt || 0);
    });

    payments.forEach(payment => {
      const customerId = payment.CustomerRef?.value;
      if (!customerId || !customers.has(customerId)) return;
      
      const customer = customers.get(customerId);
      customer.payments.push(payment);
      customer.totalPaid += parseFloat(payment.TotalAmt || 0);
    });

    const analysis = Array.from(customers.values()).map(customer => {
      // Calculate average days to payment
      const paymentDelays = [];
      customer.invoices.forEach(invoice => {
        const dueDate = new Date(invoice.DueDate);
        const payment = customer.payments.find(p => 
          p.Line?.some(l => l.LinkedTxn?.some(t => t.TxnId === invoice.Id))
        );
        
        if (payment) {
          const paymentDate = new Date(payment.TxnDate);
          const delay = (paymentDate - dueDate) / (1000 * 60 * 60 * 24);
          paymentDelays.push(delay);
        }
      });

      const avgDelay = paymentDelays.length > 0
        ? paymentDelays.reduce((a, b) => a + b, 0) / paymentDelays.length
        : 0;

      return {
        customer: customer.name,
        totalBilled: customer.totalBilled.toFixed(2),
        totalPaid: customer.totalPaid.toFixed(2),
        outstanding: (customer.totalBilled - customer.totalPaid).toFixed(2),
        averagePaymentDelay: avgDelay.toFixed(0),
        paymentBehavior: avgDelay < 0 ? 'EARLY' : avgDelay < 7 ? 'ON_TIME' : avgDelay < 30 ? 'LATE' : 'VERY_LATE'
      };
    });

    return analysis.sort((a, b) => b.totalBilled - a.totalBilled);
  }

  /**
   * Analyze A/R aging
   */
  analyzeARAging(invoices) {
    const aging = {
      current: { count: 0, amount: 0 },
      '1-30': { count: 0, amount: 0 },
      '31-60': { count: 0, amount: 0 },
      '61-90': { count: 0, amount: 0 },
      'over90': { count: 0, amount: 0 }
    };

    const today = new Date();
    
    invoices.forEach(invoice => {
      const balance = parseFloat(invoice.Balance || 0);
      if (balance <= 0) return;
      
      const dueDate = new Date(invoice.DueDate);
      const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
      
      if (daysOverdue <= 0) {
        aging.current.count++;
        aging.current.amount += balance;
      } else if (daysOverdue <= 30) {
        aging['1-30'].count++;
        aging['1-30'].amount += balance;
      } else if (daysOverdue <= 60) {
        aging['31-60'].count++;
        aging['31-60'].amount += balance;
      } else if (daysOverdue <= 90) {
        aging['61-90'].count++;
        aging['61-90'].amount += balance;
      } else {
        aging['over90'].count++;
        aging['over90'].amount += balance;
      }
    });

    const totalAR = Object.values(aging).reduce((sum, bucket) => sum + bucket.amount, 0);
    
    return {
      aging: aging,
      totalAR: totalAR.toFixed(2),
      criticalAccounts: aging['over90'].count,
      alerts: aging['over90'].amount > totalAR * 0.2 
        ? ['Over 20% of AR is past 90 days - collection efforts needed']
        : []
    };
  }

  /**
   * Analyze A/P aging with payment optimization
   */
  analyzeAPAging(bills) {
    const aging = {
      notDue: { count: 0, amount: 0 },
      '1-30': { count: 0, amount: 0 },
      '31-60': { count: 0, amount: 0 },
      'over60': { count: 0, amount: 0 }
    };

    const today = new Date();
    const paymentPriority = [];
    
    bills.forEach(bill => {
      const balance = parseFloat(bill.Balance || 0);
      if (balance <= 0) return;
      
      const dueDate = new Date(bill.DueDate);
      const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
      
      if (daysOverdue < 0) {
        aging.notDue.count++;
        aging.notDue.amount += balance;
      } else if (daysOverdue <= 30) {
        aging['1-30'].count++;
        aging['1-30'].amount += balance;
        paymentPriority.push({ bill: bill, priority: 'HIGH', daysOverdue: daysOverdue });
      } else if (daysOverdue <= 60) {
        aging['31-60'].count++;
        aging['31-60'].amount += balance;
        paymentPriority.push({ bill: bill, priority: 'CRITICAL', daysOverdue: daysOverdue });
      } else {
        aging['over60'].count++;
        aging['over60'].amount += balance;
        paymentPriority.push({ bill: bill, priority: 'URGENT', daysOverdue: daysOverdue });
      }
    });

    const totalAP = Object.values(aging).reduce((sum, bucket) => sum + bucket.amount, 0);
    
    return {
      aging: aging,
      totalAP: totalAP.toFixed(2),
      paymentPriority: paymentPriority.sort((a, b) => b.daysOverdue - a.daysOverdue),
      recommendations: this.generatePaymentRecommendations(aging, totalAP)
    };
  }

  /**
   * Generate payment recommendations
   */
  generatePaymentRecommendations(aging, totalAP) {
    const recommendations = [];
    
    if (aging['over60'].amount > totalAP * 0.15) {
      recommendations.push({
        priority: 'URGENT',
        message: 'Over 15% of payables are past 60 days. Immediate payment required to avoid penalties.'
      });
    }
    
    if (aging['31-60'].amount > totalAP * 0.25) {
      recommendations.push({
        priority: 'HIGH',
        message: 'Significant amount in 31-60 day range. Schedule payments to avoid further aging.'
      });
    }
    
    return recommendations;
  }

  /**
   * Analyze profit margins by product/service
   */
  analyzeProfitMargins(items, sales) {
    const itemAnalysis = new Map();
    
    sales.forEach(sale => {
      sale.Line?.forEach(line => {
        const itemRef = line.SalesItemLineDetail?.ItemRef;
        if (!itemRef) return;
        
        const itemId = itemRef.value;
        const itemName = itemRef.name;
        const amount = parseFloat(line.Amount || 0);
        const quantity = parseFloat(line.SalesItemLineDetail?.Qty || 1);
        
        if (!itemAnalysis.has(itemId)) {
          itemAnalysis.set(itemId, {
            name: itemName,
            revenue: 0,
            unitsSold: 0,
            transactions: []
          });
        }
        
        const analysis = itemAnalysis.get(itemId);
        analysis.revenue += amount;
        analysis.unitsSold += quantity;
        analysis.transactions.push(sale);
      });
    });

    const results = Array.from(itemAnalysis.values()).map(item => ({
      item: item.name,
      revenue: item.revenue.toFixed(2),
      unitsSold: item.unitsSold,
      averagePrice: (item.revenue / item.unitsSold).toFixed(2),
      transactionCount: item.transactions.length
    }));

    return results.sort((a, b) => b.revenue - a.revenue);
  }

  /**
   * Budget vs Actual variance analysis
   */
  analyzeBudgetVariance(budget, actual) {
    const variance = {};
    
    Object.keys(budget).forEach(category => {
      const budgetAmount = budget[category] || 0;
      const actualAmount = actual[category] || 0;
      const difference = actualAmount - budgetAmount;
      const percentVariance = budgetAmount > 0 
        ? ((difference / budgetAmount) * 100).toFixed(2)
        : 0;
      
      variance[category] = {
        budget: budgetAmount,
        actual: actualAmount,
        variance: difference,
        percentVariance: percentVariance,
        status: difference > budgetAmount * 0.1 ? 'OVER' : difference < -budgetAmount * 0.1 ? 'UNDER' : 'ON_TARGET'
      };
    });

    return variance;
  }

  /**
   * Estimate tax liability
   */
  estimateTaxLiability(income, expenses, taxRate = 0.21) {
    const taxableIncome = income - expenses;
    const estimatedTax = Math.max(0, taxableIncome * taxRate);
    
    return {
      taxableIncome: taxableIncome.toFixed(2),
      estimatedTax: estimatedTax.toFixed(2),
      effectiveRate: (taxRate * 100).toFixed(2),
      quarterlyPayment: (estimatedTax / 4).toFixed(2)
    };
  }
}

module.exports = AnalyticsEngine;
