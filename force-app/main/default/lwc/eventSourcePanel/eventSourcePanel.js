/**
 * @description       : 이벤트 소스 패널 컴포넌트 (간결하게 리팩토링)
 * @author            : sejin.park@dkbmc.com
 */
import { LightningElement, wire } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import FullCalendar from '@salesforce/resourceUrl/FullCalendarV5_new';

import getAccountList from '@salesforce/apex/CalendarAppController.getAccountList';
import getContactList from '@salesforce/apex/CalendarAppController.getContactList';
import getOpportunityList from '@salesforce/apex/CalendarAppController.getOpportunityList';

export default class EventSourcePanel extends LightningElement {
    fullCalendarInitialized = false;

    @wire(getAccountList) wiredAccounts;
    @wire(getContactList) wiredContacts;
    @wire(getOpportunityList) wiredOpportunities;

    get accountData() { 
        return this.wiredAccounts.data || []; 
    }
    
    get contactData() { 
        return this.wiredContacts.data || []; 
    }
    
    get opportunityData() { 
        return this.wiredOpportunities.data || []; 
    }
    
    renderedCallback() {
        if (this.fullCalendarInitialized) {
            return;
        }
        
        loadScript(this, FullCalendar + '/main.min.js')
            .then(() => {
                this.fullCalendarInitialized = true;
                this.initializeExternalDraggables();
            })
            .catch(error => {
                // silent error handling
            });
    }

    handleTabActive() {
        // 탭 변경 시 드래그 기능 재초기화
        setTimeout(() => {
            this.initializeExternalDraggables();
        }, 100);
    }
    
    initializeExternalDraggables() {
        if (!this.fullCalendarInitialized || !window.FullCalendar) {
            return;
        }

        try {
            // 기존 드래그 인스턴스 정리
            this.cleanupExistingDraggables();
            
            // 새로운 드래그 인스턴스 생성
            this.createSalesforceDraggable();
            this.createActivityDraggable();
        } catch (error) {
            // silent error handling
        }
    }

    // 기존 드래그 인스턴스 정리
    cleanupExistingDraggables() {
        const containers = this.template.querySelectorAll('.salesforce-components-section, .personal-activity-section');
        containers.forEach(container => {
            if (container._fcDraggable) {
                container._fcDraggable.destroy();
                delete container._fcDraggable;
            }
        });
    }

    // Salesforce 객체 드래그 기능 생성
    createSalesforceDraggable() {
        const salesforceContainer = this.template.querySelector('.salesforce-components-section');
        if (!salesforceContainer) return;

        const salesforceDraggable = new window.FullCalendar.Draggable(salesforceContainer, {
            itemSelector: '.table-row',
            eventData: this.getSalesforceEventData
        });
        
        salesforceContainer._fcDraggable = salesforceDraggable;
    }

    // 개인 활동 드래그 기능 생성
    createActivityDraggable() {
        const activityContainer = this.template.querySelector('.personal-activity-section');
        if (!activityContainer) return;

        const activityDraggable = new window.FullCalendar.Draggable(activityContainer, {
            itemSelector: '.activity-item',
            eventData: this.getActivityEventData
        });
        
        activityContainer._fcDraggable = activityDraggable;
    }

    // 이벤트 데이터 생성 함수들 - 재사용 가능하도록 분리
    getSalesforceEventData(eventEl) {
        return {
            title: eventEl.dataset.recordName,
            extendedProps: {
                relatedId: eventEl.dataset.recordId,
                recordType: eventEl.dataset.recordType,
                accountName: eventEl.dataset.accountName || ''
            }
        };
    }

    getActivityEventData(eventEl) {
        return {
            title: eventEl.dataset.recordName,
            extendedProps: {
                relatedId: eventEl.dataset.recordId,
                recordType: eventEl.dataset.recordType,
                accountName: eventEl.dataset.accountName || ''
            }
        };
    }

    disconnectedCallback() {
        this.cleanupExistingDraggables();
    }
}