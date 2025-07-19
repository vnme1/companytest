/**
 * @description       : 비용 요약 패널 컴포넌트 (간결하게 리팩토링)
 * @author            : sejin.park@dkbmc.com
 */
import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getMonthlyCostSummary from '@salesforce/apex/CalendarAppController.getMonthlyCostSummary';
import { refreshApex } from '@salesforce/apex';

// 날짜 유틸리티
const DateUtils = {
    getMonthRange: (currentMonth) => {
        const currentDate = currentMonth ? new Date(currentMonth) : new Date();
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 0, 0, 0);
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        
        return {
            start: startOfMonth.toISOString(),
            end: endOfMonth.toISOString()
        };
    }
};

// 통화 포맷터
const CurrencyFormatter = {
    format: (amount) => {
        return new Intl.NumberFormat('ko-KR', { 
            style: 'currency', 
            currency: 'KRW' 
        }).format(amount || 0);
    }
};

export default class CostSummaryPanel extends NavigationMixin(LightningElement) {
    @api currentMonth;
    @track costItems = [];
    @track totalAmount = '₩0';
    
    _wiredCostResult;

    get monthRange() {
        return DateUtils.getMonthRange(this.currentMonth);
    }

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

    processCostData(data) {
        let total = 0;
        this.costItems = [];

        Object.keys(data).forEach(costType => {
            const amount = data[costType] || 0;
            total += amount;
            this.costItems.push({
                type: costType,
                amount: CurrencyFormatter.format(amount)
            });
        });

        this.totalAmount = CurrencyFormatter.format(total);
    }

    resetCostData() {
        this.costItems = [];
        this.totalAmount = '₩0';
    }

    @api
    refreshSummary() {
        return refreshApex(this._wiredCostResult);
    }

    @api
    updateMonth(newMonth) {
        this.currentMonth = newMonth;
    }

    handleReportClick() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: '/lightning/r/Report/00OAu000005iY1WMAU/view'
            }
        });
    }
}