/**
 * @description       : 비용 요약 패널 (최적화 버전)
 * @author            : sejin.park@dkbmc.com
 */
import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getMonthlyCostSummary from '@salesforce/apex/CalendarAppController.getMonthlyCostSummary';
import { refreshApex } from '@salesforce/apex';

export default class CostSummaryPanel extends NavigationMixin(LightningElement) {
    @api currentMonth;
    @track costItems = [];
    @track totalAmount = '₩0';
    
    _wiredCostResult;

    // === Computed Properties ===
    get monthRange() {
        const currentDate = this.currentMonth ? new Date(this.currentMonth) : new Date();
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 0, 0, 0);
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        
        return {
            start: startOfMonth.toISOString(),
            end: endOfMonth.toISOString()
        };
    }

    // === Wire Service (기존 방식 유지) ===
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

    // === 데이터 처리 (클라이언트 포맷팅 유지) ===
    processCostData(data) {
        let total = 0;
        this.costItems = [];

        Object.keys(data).forEach(costType => {
            const amount = data[costType] || 0;
            total += amount;
            this.costItems.push({
                type: costType,
                amount: this.formatCurrency(amount)
            });
        });

        this.totalAmount = this.formatCurrency(total);
    }

    // 클라이언트 통화 포맷팅 (간단 유지)
    formatCurrency(amount) {
        return new Intl.NumberFormat('ko-KR', { 
            style: 'currency', 
            currency: 'KRW' 
        }).format(amount || 0);
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