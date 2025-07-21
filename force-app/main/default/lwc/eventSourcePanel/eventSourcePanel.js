/**
 * @description       : 
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-21
 * @last modified by  : sejin.park@dkbmc.com
**/
import { LightningElement, wire } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import FullCalendar from '@salesforce/resourceUrl/FullCalendarV5_new';

import getAccountList from '@salesforce/apex/CalendarAppController.getAccountList';
import getContactList from '@salesforce/apex/CalendarAppController.getContactList';
import getOpportunityList from '@salesforce/apex/CalendarAppController.getOpportunityList';

export default class EventSourcePanel extends LightningElement {
    fullCalendarInitialized = false;
    // @wire -> salesforce 데이터 자동 조회,캐싱 / 데이터 변경시 자동으로 화면 업데이트
    @wire(getAccountList) wiredAccounts;
    @wire(getContactList) wiredContacts;
    @wire(getOpportunityList) wiredOpportunities;

    get accountData() { return this.wiredAccounts.data || []; }
    get contactData() { return this.wiredContacts.data || []; }
    get opportunityData() { return this.wiredOpportunities.data || []; }
    
    renderedCallback() {
        if (this.fullCalendarInitialized) return;
        
        loadScript(this, FullCalendar + '/main.min.js')
            .then(() => {
                this.fullCalendarInitialized = true;
                this.initializeExternalDraggables();
            })
            .catch(error => {
                console.warn('FullCalendar 로드 실패:', error.message);
            });
    }

    // 탭 변경처리(탭 변경시에도 드래그 기능 제공)
    handleTabActive() {
        setTimeout(() => this.initializeExternalDraggables(), 100); //DOM 다시 랜더링 되므로
    }
    
    initializeExternalDraggables() {
        if (!this.fullCalendarInitialized || !window.FullCalendar) return;

        try {
            this.cleanupExistingDraggables(); // 기존 인스턴스 정리
            this.createDraggables(); // 새 인스턴스 생성
        } catch (error) {
            console.warn('드래그 초기화 실패:', error.message);
        }
    }

    cleanupExistingDraggables() { // 메모리 누수 발생 방지
        this.template.querySelectorAll('.salesforce-components-section, .personal-activity-section')
            .forEach(container => {
                if (container._fcDraggable) {
                    container._fcDraggable.destroy();
                    delete container._fcDraggable;
                }
            });
    }

    createDraggables() {
        const salesforceContainer = this.template.querySelector('.salesforce-components-section');
        if (salesforceContainer) {
            salesforceContainer._fcDraggable = new window.FullCalendar.Draggable(salesforceContainer, {
                itemSelector: '.table-row',
                eventData: this.getEventData
            });
        }

        const activityContainer = this.template.querySelector('.personal-activity-section');
        if (activityContainer) {
            activityContainer._fcDraggable = new window.FullCalendar.Draggable(activityContainer, {
                itemSelector: '.activity-item',
                eventData: this.getEventData
            });
        }
    }

    getEventData(eventEl) {
        return {
            title: eventEl.dataset.recordName,
            extendedProps: {
                relatedId: eventEl.dataset.recordId,
                recordType: eventEl.dataset.recordType,
                accountName: eventEl.dataset.accountName || ''
            }
        };
    }

    disconnectedCallback() { // 컴포넌트가 DOM에서 제거시 자동 호출
        this.cleanupExistingDraggables();
    }
}