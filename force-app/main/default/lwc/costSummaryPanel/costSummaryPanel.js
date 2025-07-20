/**
 * @description       : 비용 요약 패널 (에러 핸들링 강화 버전)
 * @author            : sejin.park@dkbmc.com
 */
import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getMonthlyCostSummary from '@salesforce/apex/CalendarAppController.getMonthlyCostSummary';
import { refreshApex } from '@salesforce/apex';

export default class CostSummaryPanel extends NavigationMixin(LightningElement) {
    @api currentMonth;
    @track costItems = [];
    @track totalAmount = '₩0';
    
    _wiredCostResult;

    get monthRange() {
        try {
            const currentDate = this.currentMonth ? new Date(this.currentMonth) : new Date();
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            
            return {
                start: new Date(year, month, 1).toISOString(),
                end: new Date(year, month + 1, 0).toISOString()
            };
        } catch (error) {
            console.error('월 범위 계산 오류:', error);
            const now = new Date();
            return {
                start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
                end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()
            };
        }
    }

    // ✅ 에러 핸들링 강화
    @wire(getMonthlyCostSummary, { 
        startDate: '$monthRange.start',
        endDate: '$monthRange.end' 
    })
    wiredCosts(result) {
        this._wiredCostResult = result;
        if (result.data) {
            try {
                this.processCostData(result.data);
            } catch (error) {
                console.error('비용 데이터 처리 오류:', error);
                this.resetCostData();
                this.showToast('오류', '비용 데이터 처리 중 오류가 발생했습니다.', 'error');
            }
        } else if (result.error) {
            console.error('비용 데이터 조회 오류:', result.error);
            this.resetCostData();
            this.showToast('오류', '비용 데이터를 불러오는데 실패했습니다.', 'error');
        }
    }

    // ✅ 에러 핸들링 추가
    processCostData(data) {
        if (!data || typeof data !== 'object') {
            throw new Error('잘못된 비용 데이터 형식');
        }

        try {
            let total = 0;
            this.costItems = [];

            Object.keys(data).forEach(costType => {
                const amount = Number(data[costType]) || 0;
                if (amount < 0) {
                    console.warn(`음수 비용 발견: ${costType} = ${amount}`);
                }
                total += amount;
                this.costItems.push({
                    type: costType,
                    amount: this.formatCurrency(amount)
                });
            });

            this.totalAmount = this.formatCurrency(total);
        } catch (error) {
            console.error('비용 아이템 처리 오류:', error);
            throw error;
        }
    }

    // ✅ 에러 핸들링 추가
    formatCurrency(amount) {
        try {
            const numAmount = Number(amount) || 0;
            return new Intl.NumberFormat('ko-KR', { 
                style: 'currency', 
                currency: 'KRW' 
            }).format(numAmount);
        } catch (error) {
            console.error('통화 포맷팅 오류:', error);
            return '₩0';
        }
    }

    resetCostData() {
        this.costItems = [];
        this.totalAmount = '₩0';
    }

    @api
    refreshSummary() {
        try {
            return refreshApex(this._wiredCostResult);
        } catch (error) {
            console.error('비용 요약 새로고침 오류:', error);
            this.showToast('오류', '데이터 새로고침에 실패했습니다.', 'error');
            return Promise.resolve();
        }
    }

    @api
    updateMonth(newMonth) {
        this.currentMonth = newMonth;
    }

    handleReportClick() {
        try {
            this[NavigationMixin.Navigate]({
                type: 'standard__webPage',
                attributes: {
                    url: '/lightning/r/Report/00OAu000005iY1WMAU/view'
                }
            });
        } catch (error) {
            console.error('보고서 페이지 이동 오류:', error);
            this.showToast('오류', '보고서 페이지로 이동할 수 없습니다.', 'error');
        }
    }

    // ✅ showToast 메서드 추가
    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}