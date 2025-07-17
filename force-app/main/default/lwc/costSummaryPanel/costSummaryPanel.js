/**
 * @description       : 
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-17
 * @last modified by  : sejin.park@dkbmc.com
**/
/**
 *  * Project: Salesforce Development
 *  * Author: sejin.park@dkbmc.com
 *  * Description: JavaScript 기능 구현
 *  * License: Custom
 */

import { LightningElement, wire, api, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getMonthlyCostSummary from '@salesforce/apex/CalendarAppController.getMonthlyCostSummary';

export default class CostSummaryPanel extends NavigationMixin(LightningElement) {

    @api currentMonth;

    @track costItems = [];
    @track totalAmount = '₩0';

    @wire(getMonthlyCostSummary, { startDate: '$currentMonth' })
    wiredCostSummary({ error, data }) {
        if (data) {
            let currentTotal = 0;
            // Apex에서 받아온 데이터를 화면에 표시할 형식으로 가공합니다.
            this.costItems = Object.entries(data).map(([key, value]) => {
                const amount = value || 0;
                currentTotal += amount;
                return {
                    type: key,
                    amount: this.formatCurrency(amount)
                };
            });
            this.totalAmount = this.formatCurrency(currentTotal);
        } else if (error) {
            console.error('비용 합계 조회 오류:', error);
            this.costItems = [];
            this.totalAmount = this.formatCurrency(0);
        }
    }

    @api
    refreshSummary() {
        return refreshApex(this.wiredCostSummary);
    }
    
    formatCurrency(amount) {
        return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);
    }

    // "보고서 보기" 버튼을 클릭했을 때 실행되는 함수
    handleReportClick() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: {
                // 📍 나중에 실제 보고서 ID로 변경해야 합니다.
                url: '/lightning/r/Report/00OSv000003GzhVMAS/view'
            }
        });
    }
}