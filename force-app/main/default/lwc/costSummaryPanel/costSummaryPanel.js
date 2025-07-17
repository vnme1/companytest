/**
 * @description       : 
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-17
 * @last modified by  : sejin.park@dkbmc.com
**/
import { LightningElement, wire, api, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getMonthlyCostSummary from '@salesforce/apex/CalendarAppController.getMonthlyCostSummary';
import { refreshApex } from '@salesforce/apex';

export default class CostSummaryPanel extends NavigationMixin(LightningElement) {
    @api currentMonth;
    @track costItems = [];
    @track totalAmount = '₩0';

    _wiredCostResult;

    get monthToFetch() {
        return this.currentMonth ? this.currentMonth : null;
    }

    @wire(getMonthlyCostSummary, { startDate: '$monthToFetch' })
    wiredCosts(result) {
        this._wiredCostResult = result;
        if (result.data) {
            let currentTotal = 0;
            this.costItems = Object.keys(result.data).map(key => {
                const amount = result.data[key] || 0;
                currentTotal += amount;
                return {
                    type: key,
                    amount: this.formatCurrency(amount)
                };
            });
            this.totalAmount = this.formatCurrency(currentTotal);
        } else if (result.error) {
            console.error('비용 합계 조회 오류:', result.error);
        }
    }

    @api
    refreshSummary() {
        return refreshApex(this._wiredCostResult);
    }
    
    formatCurrency(amount) {
        return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount || 0);
    }

    handleReportClick() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                url: '/lightning/r/Report/00OAu000005iY1WMAU/view' // 📍 실제 보고서 ID로 변경 필요
            }
        });
    }
}