/**
 * @description       : 이벤트 소스 패널 (간결 최적화 버전)
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
            .catch(() => {}); // Silent fail
    }

    handleTabActive() {
        setTimeout(() => this.initializeExternalDraggables(), 100);
    }
    
    initializeExternalDraggables() {
        if (!this.fullCalendarInitialized || !window.FullCalendar) return;

        try {
            this.cleanupExistingDraggables();
            this.createDraggables();
        } catch (error) {
            // Silent fail
        }
    }

    cleanupExistingDraggables() {
        this.template.querySelectorAll('.salesforce-components-section, .personal-activity-section')
            .forEach(container => {
                if (container._fcDraggable) {
                    container._fcDraggable.destroy();
                    delete container._fcDraggable;
                }
            });
    }

    createDraggables() {
        // Salesforce 객체 드래그
        const salesforceContainer = this.template.querySelector('.salesforce-components-section');
        if (salesforceContainer) {
            salesforceContainer._fcDraggable = new window.FullCalendar.Draggable(salesforceContainer, {
                itemSelector: '.table-row',
                eventData: this.getEventData
            });
        }

        // 개인 활동 드래그
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

    disconnectedCallback() {
        this.cleanupExistingDraggables();
    }
}