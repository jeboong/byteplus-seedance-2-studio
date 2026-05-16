At BytePlus, we're committed to harnessing the power of AI responsibly and ethically. We rigorously invest in building robust systems and safeguards to ensure our AI solutions deliver competitive, reliable, and safe performance while adhering to the safety and security standards.
For enhanced safety performance, BytePlus offers the **Content Pre-filter System**, a robust protection mechanism adaptable for diverse application scenarios. This content filter can detect specific categories of potentially risky content in input prompts and output completions, and will implement corresponding measures, such as refusing to answer or returning a more benign response. This protection mechanism, through a layered security stack, contributes to improving the robustness of the entire system.

<span id="9ba7c3e5"></span>
## **I. How to Enable/Disable the Content Pre-filter System**
Currently, BytePlus has integrated the Content Pre-filter System into the ModelArk platform. Users can click on **Online Inference** in the navigation bar to enter the **Custom inference endpoint** interface, where they can enable or disable the Content Pre-filter System function.

* **Create inference endpoint:** When users create a new endpoint, they can control the content filtering function via the Content Pre-filter button. To ensure the stability of content security, this feature is enabled by default.
   ![Image](https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/bd84012230664398aa54e921fd604b0e~tplv-goo7wpa0wc-image.image =1676x)
* **Start batch inference**: When the user is creating batch inference, if "create batch inference endpoint" is selected, the Content Pre-filter function is also supported to be enabled.
   ![Image](https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/2aa913ce377c43089fef8317aa94cf3c~tplv-goo7wpa0wc-image.image =1596x)
* **Edit endpoint:** If users wish to enable or disable the content pre-filter feature after creating an endpoint (including Preset inference endpoints and Custom inference endpoints in the Online inference scenario, as well as batch inference endpoints in the Batch inference scenario), they can click the edit button on the endpoint list page to modify the status of the content filtering feature. The modifications will take effect immediately. **Please note**: 
   * The implementation of Content Pre-filter shall not be construed as a warranty by BytePlus regarding the appropriateness, or compliance of AI generated content. The user remains solely responsible for the usage of any generated content and shall bear all liability and damages arising from such use.
   * Regardless of whether the user enables or disables the Content Pre-filter, they must comply with the customer agreement and [BytePlus GenAI Acceptable Use Policy](https://docs.byteplus.com/en/docs/legal/acceptable_use_policy_byteplus_genai). 
      <div style="text-align: center"><img src="https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/59b5b33785b3403bb7679b014e2ddb3a~tplv-goo7wpa0wc-image.image" width="520px" />      </div>


Besides filtering risky content, BytePlus also identifies content and/or behavior that may violate applicable product terms when using the service. Please note that even if you disable this feature, our services still maintain baseline content safety policies to strive to provide a positive usage environment for every user.

<span id="0d7fd57a"></span>
## **II. How the Content Pre-filter System Works**
When a user enables the Content Pre-filter System feature, the system will detect and identify risky content during online dialogues via the console or when calling an endpoint via API. It will then take action by refusing to answer or intervening in the response. **Note:** For users calling the API, a field will be returned in the Response to help the user determine if the model-generated content has been filtered. Specific details are as follows:

* For users of the online dialogue through ModelArk, when the system identifies risky content, it will produce a response similar to this and display the requestID. If you have any issues, please submit your feedback via the [BytePlus Ticket Center](https://console.byteplus.com/workorder/create?ref=L2Fyay9yZWdpb246YXJrK2FwLXNvdXRoZWFzdC0xL2V4cGVyaWVuY2UvY2hhdA%3D%3D) for investigation.
   * "Let's talk about something else."

<div style="text-align: center"><img src="https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/2b52e9f03c7943ea872adefec9e3ebd2~tplv-goo7wpa0wc-image.image" width="890px" /></div>


* For users calling the API, when the system identifies risky content, the “finish_reason” field in the Response will be assigned the value “content_filter”. For example: 

```JSON
...
Response
{
    "choices": [
        {
            "finish_reason": "content_filter",
            "index": 0,
            "logprobs": null,
            "message": {
                "content": "Let's talk about something else",
                "role": "assistant"
            }
        }
    ],
    ...
```


<span id="78dd6d29"></span>
## **III. What Data Does the Content Pre-filter System Filter?**

* **Minor Safety:** Any content involving the infringement of personal privacy of children and underage adolescents, and harm to their physical and mental health.
* **Hate Speech and Hateful Content:** Including but not limited to racial discrimination, nationality discrimination, ethnic discrimination, sexual orientation, personal appearance, physical disabilities, etc.
* **Nudity, Sexual, and Graphic Content:** Including but not limited to pornography, abuse, violence, and self-harm, etc.
* **Misinformation:** Content that is clearly deceptive and significantly inconsistent with facts.


<span id="a6fa1cf6"></span>
## **IV. Data Privacy and Protection**
It is important to note that when users choose to enable the Content Pre-filter feature, we will, in compliance with applicable laws and regulations, retain logs from the use of the Content Pre-filter feature and the risk-related content data filtered by it for a limited period. This data is stored on servers in Malaysia or Singapore belonging to BytePlus or its affiliates. The collected data will be used to assist you in troubleshooting issues encountered during use and to ensure normal operation.
BytePlus has established a comprehensive data security protection system, employing encryption technologies for data transmission and storage to ensure data confidentiality throughout these processes. Concurrently, we strictly control data access permissions. Data access activities are monitored and audited in real-time to safeguard your data against unauthorized acquisition by any third-party channels.
BytePlus will continue to invest in research to explore the development of reliable artificial intelligence systems that consistently adhere to our policies and human intent. We aim to help ensure that AI-generated content is healthy and safe for all users and will incorporate user feedback to achieve responsible innovation. Should you have any questions or suggestions, please do not hesitate to contact us at any time. Thank you for your trust and support in BytePlus!
