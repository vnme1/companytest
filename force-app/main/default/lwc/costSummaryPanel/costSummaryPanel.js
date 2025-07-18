/**
 * @description       : 
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-18
 * @last modified by  : sejin.park@dkbmc.com
**/
import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getMonthlyCostSummary from '@salesforce/apex/CalendarAppController.getMonthlyCostSummary';
import { refreshApex } from '@salesforce/apex';

export default class CostSummaryPanel extends NavigationMixin(LightningElement) {
    @api currentMonth;
    @track costItems = [];
    @track totalAmount = '₩0';
    
    _wiredCostResult;

   // 현재 월의 첫 번째 날과 마지막 날 계산
    get monthRange() {
        let currentDate;
        
        if (!this.currentMonth) {
            currentDate = new Date();
        } else {
            currentDate = new Date(this.currentMonth);
        }
        
        // 현재 월의 첫 번째 날
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 0, 0, 0);
        
        // 현재 월의 마지막 날
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
        
        console.log('Month range calculation:', {
            currentMonth: this.currentMonth,
            currentDate: currentDate,
            startOfMonth: startOfMonth,
            endOfMonth: endOfMonth
        });
        
        return {
            start: startOfMonth.toISOString(),
            end: endOfMonth.toISOString()
        };
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
            console.error('비용 합계 조회 오류:', result.error);
            this.costItems = [];
            this.totalAmount = '₩0';
        }
    }

    processCostData(data) {
        let total = 0;
        this.costItems = [];
        
        // 비용 타입별 데이터 처리
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

    @api
    refreshSummary() {
        return refreshApex(this._wiredCostResult);
    }
    
    @api
    updateMonth(newMonth) {
        this.currentMonth = newMonth;
    }
    
    formatCurrency(amount) {
        return new Intl.NumberFormat('ko-KR', { 
            style: 'currency', 
            currency: 'KRW' 
        }).format(amount || 0);
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