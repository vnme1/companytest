/**
 * @description       : 비용 요약 패널 컴포넌트 (간결하게 리팩토링)
 * @author            : sejin.park@dkbmc.com
 */
import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getMonthlyCostSummary from '@salesforce/apex/CalendarAppController.getMonthlyCostSummary';
import { refreshApex } from '@salesforce/apex';

// === 상수 ===
const CURRENCY_CONFIG = {
    LOCALE: 'ko-KR',
    CURRENCY: 'KRW',
    STYLE: 'currency'
};

// === 유틸리티 함수 ===
function getMonthRange(currentMonth) {
    const currentDate = currentMonth ? new Date(currentMonth) : new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 0, 0, 0);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    return {
        start: startOfMonth.toISOString(),
        end: endOfMonth.toISOString()
    };
}

function formatCurrency(amount) {
    return new Intl.NumberFormat(CURRENCY_CONFIG.LOCALE, { 
        style: CURRENCY_CONFIG.STYLE, 
        currency: CURRENCY_CONFIG.CURRENCY 
    }).format(amount || 0);
}

export default class CostSummaryPanel extends NavigationMixin(LightningElement) {
    @api currentMonth;
    @track costItems = [];
    @track totalAmount = '₩0';
    
    _wiredCostResult;

    // === Computed Properties ===
    get monthRange() {
        return getMonthRange(this.currentMonth);
    }

    // === Wire Service ===
    @wire(getMonthlyCostSummary, { 
        startDate: '$monthRange.start',
        endDate: '$monthRange.end' 
    })
    wiredCosts(result) {
        this._wiredCostResult = result;
        if (result.data) {
            this.processCostData(result.data);
        } else if (result.error) {
            this.resetCostData();
        }
    }

    // === 데이터 처리 ===
    processCostData(data) {
        let total = 0;
        this.costItems = [];

        Object.keys(data).forEach(costType => {
            const amount = data[costType] || 0;
            total += amount;
            this.costItems.push({
                type: costType,
                amount: formatCurrency(amount)
            });
        });

        this.totalAmount = formatCurrency(total);
    }

    resetCostData() {
        this.costItems = [];
        this.totalAmount = '₩0';
    }

    // === Public API Methods ===
    @api
    refreshSummary() {
        return refreshApex(this._wiredCostResult);
    }

    @api
    updateMonth(newMonth) {
        this.currentMonth = newMonth;
    }

    // === 이벤트 핸들러 ===
    handleReportClick() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: '/lightning/r/Report/00OAu000005iY1WMAU/view'
            }
        });
    }
}