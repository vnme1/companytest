/**
 * @description       : 우측 비용 요약 패널
 * 
 * @Method :
 *  - wiredCosts(result) : 월별 비용 데이터 자동조회 및 처리
 *  - processCostData(data) : 비용 데이터 가공 및 표시
 *  - resetCostData() : 비용 데이터 초기화
 *  - @api refreshSummary() : 비용 요약 데이터 새로고침
 *  - @api updateMonth(newMonth) : 표시 월 업데이트
 *  - handleReportClick() : 보고서 페이지 이동
 *  - formatCurrency(amount) : 원화로 포맷팅
 *  - showToast(title, message, variant) : 토스트 메시지 표시
 * 
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-23
 * @last modified by  : sejin.park@dkbmc.com
**/
import { LightningElement, api, track, wire } from 'lwc';

import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';

// apex 메소드
import getMonthlyCostSummary from '@salesforce/apex/CalendarAppController.getMonthlyCostSummary';

export default class CostSummaryPanel extends NavigationMixin(LightningElement) {
    @api currentMonth;

    @track costItems = [];
    @track totalAmount = '₩0';

    _wiredCostResult;

    // --데이터 계산--
    // 현재 월 시작, 끝 날짜 계산
    get monthRange() {
        try {
            const currentDate = this.currentMonth ? new Date(this.currentMonth) : new Date();
            
            if (isNaN(currentDate.getTime())) {
                throw new Error('잘못된 날짜 형식입니다.');
            }

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

    // --데이터 수신--
    // 월별 비용 데이터 자동조회 및 처리
    @wire(getMonthlyCostSummary, { // @wire 데코레이터
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
                this.showToast('Error', 'An error occurred while processing cost data.', 'error');
            }
        } else if (result.error) {
            console.error('비용 데이터 조회 오류:', result.error);
            this.resetCostData();
            this.showToast('Error', 'Failed to load cost data.', 'error');
        }
    }

    // --데이터 가공--
    // 비용 데이터 가공 및 표시
    processCostData(data) {
        try {
            if (!data || typeof data !== 'object') {
                throw new Error('잘못된 비용 데이터 형식');
            }

            let total = 0;
            this.costItems = [];

            Object.keys(data).forEach(costType => {
                try {
                    const amount = Number(data[costType]) || 0;
                    
                    if (amount < 0) {
                        console.warn(`음수 비용 발견: ${costType} = ${amount}`);
                    }
                    
                    total += amount;
                    this.costItems.push({
                        type: costType,
                        amount: this.formatCurrency(amount)
                    });
                } catch (itemError) {
                    console.error(`비용 항목 처리 오류 (${costType}):`, itemError);
                }
            });

            this.totalAmount = this.formatCurrency(total);

        } catch (error) {
            console.error('비용 아이템 처리 오류:', error);
            throw error;
        }
    }

    // 비용 데이터 초기화
    resetCostData() {
        try {
            this.costItems = [];
            this.totalAmount = '₩0';
        } catch (error) {
            console.error('비용 데이터 리셋 오류:', error);
        }
    }

    // --외부 api--
    // 비용 요약 데이터 새로고침
    @api
    async refreshSummary() {
        try {
            await refreshApex(this._wiredCostResult);
        } catch (error) {
            console.error('비용 요약 새로고침 오류:', error);
            this.showToast('Error', 'Failed to refresh data.', 'error');
        }
    }

    // 표시 월 업데이트
    @api
    updateMonth(newMonth) {
        try {
            if (!newMonth) {
                console.warn('새로운 월 정보가 없습니다.');
                return;
            }
            // eslint-disable-next-line @lwc/lwc/no-api-reassignments
            this.currentMonth = newMonth;
        } catch (error) {
            console.error('월 업데이트 오류:', error);
        }
    }

    // --이벤트 처리--
    // 보고서 페이지 이동
    async handleReportClick() {
        try {
            await this[NavigationMixin.Navigate]({
                type: 'standard__webPage',
                attributes: {
                    url: '/lightning/r/Report/00OAu000005iY1WMAU/view'
                }
            });
        } catch (error) {
            console.error('보고서 페이지 이동 오류:', error);
            this.showToast('Error', 'Unable to navigate to the report page.', 'error');
        }
    }

    // --유틸리티 메소드--
    // 원화로 포맷팅
    formatCurrency(amount) {
        try {
            const numAmount = Number(amount) || 0;
            
            if (isNaN(numAmount)) {
                throw new Error('숫자가 아닌 값입니다.');
            }
            
            return new Intl.NumberFormat('ko-KR', { 
                style: 'currency', 
                currency: 'KRW' 
            }).format(numAmount);
        } catch (error) {
            console.error('통화 포맷팅 오류:', error);
            return '₩0';
        }
    }
    
    showToast(title, message, variant) {
        try {
            this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
        } catch (error) {
            console.error('Failed to display toast message :', error);
        }
    }
}