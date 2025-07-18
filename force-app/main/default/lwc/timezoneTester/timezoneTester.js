/**
 * @description       : 
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-18
 * @last modified by  : sejin.park@dkbmc.com
**/
import { LightningElement } from 'lwc';

export default class TimezoneTester extends LightningElement {
    // 한국 시간 2025년 7월 18일 오전 10:00는
    // GMT 표준시로는 2025년 7월 18일 오전 1:00 입니다.
    gmtTimeValue = '2025-07-18T01:00:00.000Z';
}